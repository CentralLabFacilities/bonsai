use std::collections::BTreeMap;

#[derive(Debug, Clone, Default)]
pub(super) struct XmlNode {
    pub name: String,
    pub attributes: BTreeMap<String, String>,
    pub children: Vec<XmlNode>,
}

impl XmlNode {
    pub fn local_name(&self) -> &str {
        self.name.rsplit(':').next().unwrap_or(&self.name)
    }

    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attributes.get(name).map(String::as_str)
    }

    pub fn direct_children<'a>(&'a self, local_name: &str) -> impl Iterator<Item = &'a XmlNode> + 'a {
        let local_name = local_name.to_string();
        self.children
            .iter()
            .filter(move |child| child.local_name() == local_name)
    }

    pub fn first_direct_child(&self, local_name: &str) -> Option<&XmlNode> {
        self.direct_children(local_name).next()
    }

}

pub(super) fn parse_document(input: &str) -> Result<XmlNode, String> {
    let normalized = input
        .replace("<!-->", "<!--")
        .replace("</-->", "-->");
    let bytes = normalized.as_bytes();
    let mut cursor = 0usize;
    let mut stack: Vec<XmlNode> = Vec::new();
    let mut root: Option<XmlNode> = None;

    while cursor < bytes.len() {
        let Some(relative_lt) = normalized[cursor..].find('<') else {
            break;
        };
        cursor += relative_lt;

        if normalized[cursor..].starts_with("<!--") {
            let Some(relative_end) = normalized[cursor + 4..].find("-->") else {
                return Err("Comment not terminated".to_string());
            };
            cursor += 4 + relative_end + 3;
            continue;
        }

        if normalized[cursor..].starts_with("<?") {
            let Some(relative_end) = normalized[cursor + 2..].find("?>") else {
                return Err("Processing instruction not terminated".to_string());
            };
            cursor += 2 + relative_end + 2;
            continue;
        }

        if normalized[cursor..].starts_with("<![CDATA[") {
            let Some(relative_end) = normalized[cursor + 9..].find("]]>") else {
                return Err("CDATA section not terminated".to_string());
            };
            cursor += 9 + relative_end + 3;
            continue;
        }

        if normalized[cursor..].starts_with("<!") {
            let end = find_tag_end(&normalized, cursor + 2)?;
            cursor = end + 1;
            continue;
        }

        if normalized[cursor..].starts_with("</") {
            let end = find_tag_end(&normalized, cursor + 2)?;
            let close_name = normalized[cursor + 2..end].trim();
            let node = stack
                .pop()
                .ok_or_else(|| format!("Unexpected closing tag </{close_name}>"))?;

            if node.name != close_name {
                return Err(format!(
                    "Mismatched closing tag: expected </{}> but found </{}>",
                    node.name, close_name
                ));
            }

            append_completed_node(node, &mut stack, &mut root)?;
            cursor = end + 1;
            continue;
        }

        let end = find_tag_end(&normalized, cursor + 1)?;
        let raw_tag = normalized[cursor + 1..end].trim();
        let self_closing = raw_tag.ends_with('/');
        let raw_tag = if self_closing {
            raw_tag[..raw_tag.len() - 1].trim_end()
        } else {
            raw_tag
        };

        let node = parse_opening_tag(raw_tag)?;
        if self_closing {
            append_completed_node(node, &mut stack, &mut root)?;
        } else {
            stack.push(node);
        }
        cursor = end + 1;
    }

    if let Some(unclosed) = stack.last() {
        return Err(format!("Element <{}> is not closed", unclosed.name));
    }

    root.ok_or_else(|| "XML document does not contain a root element".to_string())
}

fn append_completed_node(
    node: XmlNode,
    stack: &mut Vec<XmlNode>,
    root: &mut Option<XmlNode>,
) -> Result<(), String> {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(node);
        return Ok(());
    }

    if root.is_some() {
        return Err("XML document contains more than one root element".to_string());
    }

    *root = Some(node);
    Ok(())
}

fn find_tag_end(input: &str, start: usize) -> Result<usize, String> {
    let bytes = input.as_bytes();
    let mut quote: Option<u8> = None;
    let mut cursor = start;

    while cursor < bytes.len() {
        let current = bytes[cursor];
        match quote {
            Some(active_quote) if current == active_quote => quote = None,
            Some(_) => {}
            None if current == b'\'' || current == b'"' => quote = Some(current),
            None if current == b'>' => return Ok(cursor),
            None => {}
        }
        cursor += 1;
    }

    Err("XML tag not terminated".to_string())
}

fn parse_opening_tag(raw: &str) -> Result<XmlNode, String> {
    let mut cursor = 0usize;
    skip_whitespace(raw, &mut cursor);
    let name = read_name(raw, &mut cursor);
    if name.is_empty() {
        return Err("XML element is missing a name".to_string());
    }

    let mut attributes = BTreeMap::new();

    loop {
        skip_whitespace(raw, &mut cursor);
        if cursor >= raw.len() {
            break;
        }

        let attribute_name = read_name(raw, &mut cursor);
        if attribute_name.is_empty() {
            return Err(format!("Invalid attribute syntax in <{name}>") );
        }

        skip_whitespace(raw, &mut cursor);
        if raw.as_bytes().get(cursor) != Some(&b'=') {
            return Err(format!("Attribute '{attribute_name}' in <{name}> is missing '='"));
        }
        cursor += 1;
        skip_whitespace(raw, &mut cursor);

        let quote = *raw
            .as_bytes()
            .get(cursor)
            .ok_or_else(|| format!("Attribute '{attribute_name}' in <{name}> has no value"))?;
        if quote != b'\'' && quote != b'"' {
            return Err(format!("Attribute '{attribute_name}' in <{name}> must be quoted"));
        }
        cursor += 1;
        let value_start = cursor;

        while cursor < raw.len() && raw.as_bytes()[cursor] != quote {
            cursor += 1;
        }
        if cursor >= raw.len() {
            return Err(format!("Attribute '{attribute_name}' in <{name}> is not terminated"));
        }

        let value = decode_xml_entities(&raw[value_start..cursor])?;
        cursor += 1;
        attributes.insert(attribute_name.to_string(), value);
    }

    Ok(XmlNode {
        name: name.to_string(),
        attributes,
        children: Vec::new(),
    })
}

fn skip_whitespace(input: &str, cursor: &mut usize) {
    while *cursor < input.len() && input.as_bytes()[*cursor].is_ascii_whitespace() {
        *cursor += 1;
    }
}

fn read_name<'a>(input: &'a str, cursor: &mut usize) -> &'a str {
    let start = *cursor;
    while *cursor < input.len() {
        let byte = input.as_bytes()[*cursor];
        if byte.is_ascii_whitespace() || byte == b'=' || byte == b'/' || byte == b'>' {
            break;
        }
        *cursor += 1;
    }
    &input[start..*cursor]
}

fn decode_xml_entities(value: &str) -> Result<String, String> {
    if !value.contains('&') {
        return Ok(value.to_string());
    }

    let mut output = String::with_capacity(value.len());
    let mut cursor = 0usize;

    while let Some(relative_amp) = value[cursor..].find('&') {
        let amp = cursor + relative_amp;
        output.push_str(&value[cursor..amp]);
        let Some(relative_semicolon) = value[amp + 1..].find(';') else {
            return Err("Unterminated XML entity".to_string());
        };
        let semicolon = amp + 1 + relative_semicolon;
        let entity = &value[amp + 1..semicolon];
        let decoded = match entity {
            "amp" => "&".to_string(),
            "lt" => "<".to_string(),
            "gt" => ">".to_string(),
            "quot" => "\"".to_string(),
            "apos" => "'".to_string(),
            _ if entity.starts_with("#x") => {
                let code = u32::from_str_radix(&entity[2..], 16)
                    .map_err(|_| format!("Invalid XML entity '&{entity};'"))?;
                char::from_u32(code)
                    .ok_or_else(|| format!("Invalid XML code point '&{entity};'"))?
                    .to_string()
            }
            _ if entity.starts_with('#') => {
                let code = entity[1..]
                    .parse::<u32>()
                    .map_err(|_| format!("Invalid XML entity '&{entity};'"))?;
                char::from_u32(code)
                    .ok_or_else(|| format!("Invalid XML code point '&{entity};'"))?
                    .to_string()
            }
            _ => return Err(format!("Unsupported XML entity '&{entity};'")),
        };
        output.push_str(&decoded);
        cursor = semicolon + 1;
    }

    output.push_str(&value[cursor..]);
    Ok(output)
}

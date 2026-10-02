use std::collections::HashMap;

use super::types::RuntimeValueDto;

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Value(RuntimeValueDto),
    Identifier(String),
    Operator(String),
    LeftParen,
    RightParen,
}

fn is_identifier_start(value: u8) -> bool {
    value.is_ascii_alphabetic() || matches!(value, b'_' | b'$')
}

fn is_identifier_part(value: u8) -> bool {
    is_identifier_start(value) || value.is_ascii_digit()
}

fn tokenize(source: &str) -> Result<Vec<Token>, String> {
    let bytes = source.as_bytes();
    let mut tokens = Vec::new();
    let mut index = 0usize;

    while index < bytes.len() {
        let byte = bytes[index];
        if byte.is_ascii_whitespace() {
            index += 1;
            continue;
        }

        if matches!(byte, b'\'' | b'"') {
            let quote = byte as char;
            index += 1;
            let mut value = String::new();
            let mut closed = false;
            while index < bytes.len() {
                let next = source[index..]
                    .chars()
                    .next()
                    .ok_or_else(|| "Unterminated string literal".to_string())?;
                index += next.len_utf8();
                if next == '\\' {
                    if index >= bytes.len() {
                        break;
                    }
                    let escaped = source[index..]
                        .chars()
                        .next()
                        .ok_or_else(|| "Unterminated string literal".to_string())?;
                    index += escaped.len_utf8();
                    value.push(match escaped {
                        'n' => '\n',
                        'r' => '\r',
                        't' => '\t',
                        '\\' => '\\',
                        '\'' => '\'',
                        '"' => '"',
                        other => other,
                    });
                    continue;
                }
                if next == quote {
                    closed = true;
                    break;
                }
                value.push(next);
            }
            if !closed {
                return Err("Unterminated string literal".into());
            }
            tokens.push(Token::Value(RuntimeValueDto::String(value)));
            continue;
        }

        if byte.is_ascii_digit() || (byte == b'.' && bytes.get(index + 1).is_some_and(u8::is_ascii_digit)) {
            let start = index;
            let mut seen_dot = byte == b'.';
            index += 1;
            while index < bytes.len() {
                let next = bytes[index];
                if next.is_ascii_digit() {
                    index += 1;
                    continue;
                }
                if next == b'.' && !seen_dot {
                    seen_dot = true;
                    index += 1;
                    continue;
                }
                break;
            }
            if index < bytes.len() && matches!(bytes[index], b'e' | b'E') {
                let exponent_start = index;
                index += 1;
                if index < bytes.len() && matches!(bytes[index], b'+' | b'-') {
                    index += 1;
                }
                let digits_start = index;
                while index < bytes.len() && bytes[index].is_ascii_digit() {
                    index += 1;
                }
                if digits_start == index {
                    index = exponent_start;
                }
            }
            let raw = &source[start..index];
            let number = raw
                .parse::<f64>()
                .map_err(|_| format!("Invalid number '{raw}'"))?;
            tokens.push(Token::Value(RuntimeValueDto::Number(number)));
            continue;
        }

        let mut identifier_prefix = false;
        if byte == b'@' && bytes.get(index + 1).is_some_and(|next| is_identifier_start(*next)) {
            identifier_prefix = true;
            index += 1;
        }
        if index < bytes.len() && is_identifier_start(bytes[index]) {
            let start = index;
            index += 1;
            while index < bytes.len() && is_identifier_part(bytes[index]) {
                index += 1;
            }
            let mut identifier = String::new();
            if identifier_prefix {
                identifier.push('@');
            }
            identifier.push_str(&source[start..index]);
            match identifier.as_str() {
                "true" => tokens.push(Token::Value(RuntimeValueDto::Bool(true))),
                "false" => tokens.push(Token::Value(RuntimeValueDto::Bool(false))),
                "null" => tokens.push(Token::Value(RuntimeValueDto::Null)),
                _ => tokens.push(Token::Identifier(identifier)),
            }
            continue;
        }

        let remaining = &source[index..];
        if let Some(operator) = ["===", "!==", "<=", ">=", "==", "!=", "&&", "||"]
            .into_iter()
            .find(|operator| remaining.starts_with(operator))
        {
            tokens.push(Token::Operator(operator.into()));
            index += operator.len();
            continue;
        }

        match byte {
            b'(' => tokens.push(Token::LeftParen),
            b')' => tokens.push(Token::RightParen),
            b'+' | b'-' | b'*' | b'/' | b'%' | b'<' | b'>' | b'!' => {
                tokens.push(Token::Operator((byte as char).to_string()))
            }
            _ => return Err(format!("Unsupported token '{}'", byte as char)),
        }
        index += 1;
    }

    Ok(tokens)
}

fn truthy(value: &RuntimeValueDto) -> bool {
    match value {
        RuntimeValueDto::Null => false,
        RuntimeValueDto::Bool(value) => *value,
        RuntimeValueDto::Number(value) => *value != 0.0 && !value.is_nan(),
        RuntimeValueDto::String(value) => !value.is_empty(),
    }
}

fn to_number(value: &RuntimeValueDto) -> Result<f64, String> {
    match value {
        RuntimeValueDto::Null => Ok(0.0),
        RuntimeValueDto::Bool(value) => Ok(if *value { 1.0 } else { 0.0 }),
        RuntimeValueDto::Number(value) => Ok(*value),
        RuntimeValueDto::String(value) => value
            .trim()
            .parse::<f64>()
            .map_err(|_| format!("'{}' is not numeric", value)),
    }
}

fn to_js_string(value: &RuntimeValueDto) -> String {
    match value {
        RuntimeValueDto::Null => "null".into(),
        RuntimeValueDto::Bool(value) => value.to_string(),
        RuntimeValueDto::Number(value) => {
            if value.fract() == 0.0 {
                format!("{value:.0}")
            } else {
                value.to_string()
            }
        }
        RuntimeValueDto::String(value) => value.clone(),
    }
}

fn finite_number(value: f64) -> Result<RuntimeValueDto, String> {
    if value.is_finite() {
        Ok(RuntimeValueDto::Number(value))
    } else {
        Err("Expression produced a non-finite number".into())
    }
}

fn strict_equal(left: &RuntimeValueDto, right: &RuntimeValueDto) -> bool {
    match (left, right) {
        (RuntimeValueDto::Null, RuntimeValueDto::Null) => true,
        (RuntimeValueDto::Bool(left), RuntimeValueDto::Bool(right)) => left == right,
        (RuntimeValueDto::Number(left), RuntimeValueDto::Number(right)) => left == right,
        (RuntimeValueDto::String(left), RuntimeValueDto::String(right)) => left == right,
        _ => false,
    }
}

struct Parser<'a> {
    tokens: Vec<Token>,
    position: usize,
    values: &'a HashMap<String, RuntimeValueDto>,
    suffix_parts: &'a [String],
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.position)
    }

    fn consume(&mut self) -> Result<Token, String> {
        let token = self
            .tokens
            .get(self.position)
            .cloned()
            .ok_or_else(|| "Unexpected end of expression".to_string())?;
        self.position += 1;
        Ok(token)
    }

    fn resolve_identifier(&self, raw_name: &str) -> Result<RuntimeValueDto, String> {
        let local_name = raw_name.trim().trim_start_matches('@');
        let scoped_name = if self.suffix_parts.is_empty() {
            local_name.to_string()
        } else {
            format!("{}_{}", local_name, self.suffix_parts.join("_"))
        };

        if scoped_name != local_name {
            if let Some(value) = self.values.get(&scoped_name) {
                return Ok(value.clone());
            }
        }
        self.values
            .get(local_name)
            .cloned()
            .ok_or_else(|| format!("Unknown variable '{local_name}'"))
    }

    fn parse_primary(&mut self) -> Result<RuntimeValueDto, String> {
        match self.consume()? {
            Token::Value(value) => Ok(value),
            Token::Identifier(identifier) => self.resolve_identifier(&identifier),
            Token::LeftParen => {
                let value = self.parse_or()?;
                match self.consume()? {
                    Token::RightParen => Ok(value),
                    _ => Err("Expected ')'".into()),
                }
            }
            Token::RightParen => Err("Unexpected ')'".into()),
            Token::Operator(operator) => Err(format!("Unexpected token '{operator}'")),
        }
    }

    fn parse_unary(&mut self) -> Result<RuntimeValueDto, String> {
        let operator = match self.peek() {
            Some(Token::Operator(operator)) if matches!(operator.as_str(), "!" | "+" | "-") => {
                Some(operator.clone())
            }
            _ => None,
        };
        if let Some(operator) = operator {
            self.position += 1;
            let value = self.parse_unary()?;
            return match operator.as_str() {
                "!" => Ok(RuntimeValueDto::Bool(!truthy(&value))),
                "+" => finite_number(to_number(&value)?),
                "-" => finite_number(-to_number(&value)?),
                _ => unreachable!(),
            };
        }
        self.parse_primary()
    }

    fn parse_multiplicative(&mut self) -> Result<RuntimeValueDto, String> {
        let mut left = self.parse_unary()?;
        loop {
            let operator = match self.peek() {
                Some(Token::Operator(operator)) if matches!(operator.as_str(), "*" | "/" | "%") => {
                    operator.clone()
                }
                _ => break,
            };
            self.position += 1;
            let right = self.parse_unary()?;
            let left_number = to_number(&left)?;
            let right_number = to_number(&right)?;
            left = match operator.as_str() {
                "*" => finite_number(left_number * right_number)?,
                "/" => finite_number(left_number / right_number)?,
                "%" => finite_number(left_number % right_number)?,
                _ => unreachable!(),
            };
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<RuntimeValueDto, String> {
        let mut left = self.parse_multiplicative()?;
        loop {
            let operator = match self.peek() {
                Some(Token::Operator(operator)) if matches!(operator.as_str(), "+" | "-") => {
                    operator.clone()
                }
                _ => break,
            };
            self.position += 1;
            let right = self.parse_multiplicative()?;
            left = if operator == "+" {
                if matches!(&left, RuntimeValueDto::String(_))
                    || matches!(&right, RuntimeValueDto::String(_))
                {
                    RuntimeValueDto::String(format!(
                        "{}{}",
                        to_js_string(&left),
                        to_js_string(&right)
                    ))
                } else {
                    finite_number(to_number(&left)? + to_number(&right)?)?
                }
            } else {
                finite_number(to_number(&left)? - to_number(&right)?)?
            };
        }
        Ok(left)
    }

    fn parse_relational(&mut self) -> Result<RuntimeValueDto, String> {
        let mut left = self.parse_additive()?;
        loop {
            let operator = match self.peek() {
                Some(Token::Operator(operator))
                    if matches!(operator.as_str(), "<" | "<=" | ">" | ">=") =>
                {
                    operator.clone()
                }
                _ => break,
            };
            self.position += 1;
            let right = self.parse_additive()?;
            let result = match (&left, &right) {
                (RuntimeValueDto::String(left), RuntimeValueDto::String(right)) => match operator.as_str() {
                    "<" => left < right,
                    "<=" => left <= right,
                    ">" => left > right,
                    ">=" => left >= right,
                    _ => unreachable!(),
                },
                _ => {
                    let left = to_number(&left)?;
                    let right = to_number(&right)?;
                    match operator.as_str() {
                        "<" => left < right,
                        "<=" => left <= right,
                        ">" => left > right,
                        ">=" => left >= right,
                        _ => unreachable!(),
                    }
                }
            };
            left = RuntimeValueDto::Bool(result);
        }
        Ok(left)
    }

    fn parse_equality(&mut self) -> Result<RuntimeValueDto, String> {
        let mut left = self.parse_relational()?;
        loop {
            let operator = match self.peek() {
                Some(Token::Operator(operator))
                    if matches!(operator.as_str(), "==" | "!=" | "===" | "!==") =>
                {
                    operator.clone()
                }
                _ => break,
            };
            self.position += 1;
            let right = self.parse_relational()?;
            let equal = strict_equal(&left, &right);
            left = RuntimeValueDto::Bool(if matches!(operator.as_str(), "!=" | "!==") {
                !equal
            } else {
                equal
            });
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<RuntimeValueDto, String> {
        let mut left = self.parse_equality()?;
        while matches!(self.peek(), Some(Token::Operator(operator)) if operator == "&&") {
            self.position += 1;
            let right = self.parse_equality()?;
            left = if truthy(&left) { right } else { left };
        }
        Ok(left)
    }

    fn parse_or(&mut self) -> Result<RuntimeValueDto, String> {
        let mut left = self.parse_and()?;
        while matches!(self.peek(), Some(Token::Operator(operator)) if operator == "||") {
            self.position += 1;
            let right = self.parse_and()?;
            left = if truthy(&left) { left } else { right };
        }
        Ok(left)
    }
}

pub(crate) fn evaluate_runtime_expression(
    expression: &str,
    values: &HashMap<String, RuntimeValueDto>,
    suffix_parts: &[String],
) -> Result<RuntimeValueDto, String> {
    let tokens = tokenize(expression)?;
    let mut parser = Parser {
        tokens,
        position: 0,
        values,
        suffix_parts,
    };
    let value = parser.parse_or()?;
    if parser.position != parser.tokens.len() {
        let token = parser.tokens.get(parser.position);
        return Err(format!("Unexpected token '{token:?}'"));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::evaluate_runtime_expression;
    use crate::core::runtime::types::RuntimeValueDto;

    #[test]
    fn evaluates_scoped_identifiers_and_arithmetic() {
        let mut values = HashMap::new();
        values.insert("count_child".into(), RuntimeValueDto::Number(2.0));
        values.insert("count".into(), RuntimeValueDto::Number(20.0));

        let result = evaluate_runtime_expression(
            "count + 3",
            &values,
            &["child".into()],
        )
        .unwrap();

        assert_eq!(result, RuntimeValueDto::Number(5.0));
    }

    #[test]
    fn evaluates_boolean_and_string_expressions() {
        let values = HashMap::new();
        assert_eq!(
            evaluate_runtime_expression("1 < 2 && true", &values, &[]).unwrap(),
            RuntimeValueDto::Bool(true)
        );
        assert_eq!(
            evaluate_runtime_expression("'a' + 'b'", &values, &[]).unwrap(),
            RuntimeValueDto::String("ab".into())
        );
    }
}

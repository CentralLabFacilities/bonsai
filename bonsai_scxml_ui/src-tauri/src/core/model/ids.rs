#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub(crate) struct StateId(String);

impl StateId {
    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for StateId {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.as_str()
    }
}

impl std::borrow::Borrow<str> for StateId {
    fn borrow(&self) -> &str {
        self.as_str()
    }
}

impl PartialEq<&str> for StateId {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl std::fmt::Display for StateId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl From<String> for StateId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<&str> for StateId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub(crate) struct TransitionId(String);

impl TransitionId {
    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::ops::Deref for TransitionId {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.as_str()
    }
}

impl std::borrow::Borrow<str> for TransitionId {
    fn borrow(&self) -> &str {
        self.as_str()
    }
}

impl PartialEq<&str> for TransitionId {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl std::fmt::Display for TransitionId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl From<String> for TransitionId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<&str> for TransitionId {
    fn from(value: &str) -> Self {
        Self(value.to_string())
    }
}

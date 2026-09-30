#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeLogDto {
    #[serde(default)]
    pub steps: Vec<RuntimeStepDto>,
    #[serde(default)]
    pub first_entry: Option<RuntimeEntryDto>,
    #[serde(default)]
    pub slot_samples: Vec<RuntimeSlotSampleDto>,
    #[serde(default)]
    pub parameter_samples: Vec<RuntimeParameterSampleDto>,
    #[serde(default)]
    pub data_samples: Vec<RuntimeDataSampleDto>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeStepDto {
    pub timestamp: String,
    pub source: String,
    pub target: String,
    pub event: String,
    pub line: usize,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeEntryDto {
    pub timestamp: String,
    pub state: String,
    pub line: usize,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeSlotSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub operation: String,
    #[serde(default)]
    pub slot_key: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeParameterSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub expr: String,
    #[serde(default)]
    pub value: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeDataSampleDto {
    pub timestamp: String,
    pub line: usize,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub expr: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub kind: String,
}

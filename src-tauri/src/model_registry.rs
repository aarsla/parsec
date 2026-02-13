use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Parakeet,
    Whisper,
}

pub struct ModelDef {
    pub id: &'static str,
    pub name: &'static str,
    pub engine: Engine,
    pub description: &'static str,
    pub approx_bytes: u64,
    pub files: &'static [ModelFile],
}

pub struct ModelFile {
    pub url: &'static str,
    /// Rename the downloaded file to this name (if Some).
    pub rename_to: Option<&'static str>,
}

pub const DEFAULT_MODEL_ID: &str = "parakeet-tdt-0.6b-v3";

pub static MODELS: &[ModelDef] = &[
    ModelDef {
        id: "parakeet-tdt-0.6b-v3",
        name: "Parakeet TDT 0.6b v3",
        engine: Engine::Parakeet,
        description: "Fast, accurate English transcription. Best balance of speed and quality.",
        approx_bytes: 680_000_000,
        files: &[
            ModelFile { url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/encoder-model.int8.onnx", rename_to: Some("encoder-model.onnx") },
            ModelFile { url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/decoder_joint-model.int8.onnx", rename_to: Some("decoder_joint-model.onnx") },
            ModelFile { url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/vocab.txt", rename_to: None },
            ModelFile { url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/config.json", rename_to: None },
            ModelFile { url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/nemo128.onnx", rename_to: None },
        ],
    },
    ModelDef {
        id: "whisper-large-v3-turbo-q5_0",
        name: "Whisper Large v3 Turbo (Q5)",
        engine: Engine::Whisper,
        description: "Multilingual, highly accurate. Supports 100+ languages.",
        approx_bytes: 574_000_000,
        files: &[
            ModelFile { url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin", rename_to: Some("model.bin") },
        ],
    },
    ModelDef {
        id: "whisper-large-v3-turbo-q8_0",
        name: "Whisper Large v3 Turbo (Q8)",
        engine: Engine::Whisper,
        description: "Multilingual, highest accuracy. Higher quality quantization.",
        approx_bytes: 874_000_000,
        files: &[
            ModelFile { url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin", rename_to: Some("model.bin") },
        ],
    },
    ModelDef {
        id: "whisper-medium-q5_0",
        name: "Whisper Medium (Q5)",
        engine: Engine::Whisper,
        description: "Multilingual, moderate speed and accuracy. Good middle ground.",
        approx_bytes: 539_000_000,
        files: &[
            ModelFile { url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin", rename_to: Some("model.bin") },
        ],
    },
    ModelDef {
        id: "whisper-small-q5_1",
        name: "Whisper Small (Q5)",
        engine: Engine::Whisper,
        description: "Multilingual, fastest Whisper model. Smallest download.",
        approx_bytes: 190_000_000,
        files: &[
            ModelFile { url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin", rename_to: Some("model.bin") },
        ],
    },
];

pub fn find_model(id: &str) -> Option<&'static ModelDef> {
    MODELS.iter().find(|m| m.id == id)
}

fn models_base_dir() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    data_dir.join("com.aarsla.audioshift").join("models")
}

pub fn model_dir(id: &str) -> PathBuf {
    models_base_dir().join(id)
}

pub fn model_ready(id: &str) -> bool {
    let def = match find_model(id) {
        Some(d) => d,
        None => return false,
    };
    let dir = model_dir(id);
    for file in def.files {
        let name = file_dest_name(file);
        if !dir.join(name).exists() {
            return false;
        }
    }
    true
}

pub fn model_disk_size(id: &str) -> u64 {
    let dir = model_dir(id);
    if !dir.exists() {
        return 0;
    }
    std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.metadata().ok().map(|m| m.len()))
                .sum()
        })
        .unwrap_or(0)
}

pub fn any_model_ready() -> bool {
    MODELS.iter().any(|m| model_ready(m.id))
}

/// Get the destination filename for a model file (after optional rename).
pub fn file_dest_name(file: &ModelFile) -> &str {
    if let Some(name) = file.rename_to {
        name
    } else {
        file.url.rsplit('/').next().unwrap_or("unknown")
    }
}

/// Format approximate bytes as a human-readable label.
pub fn size_label(bytes: u64) -> String {
    if bytes >= 1_000_000_000 {
        format!("{:.1} GB", bytes as f64 / 1_000_000_000.0)
    } else {
        format!("{} MB", bytes / 1_000_000)
    }
}

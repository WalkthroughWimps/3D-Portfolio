# Local Fish speech activity assets

These files run in the browser only. No clip audio is uploaded. The `.bin` file contains an ONNX model; its extension lets the release artifact include the model.

| File | Upstream | Version | License |
| --- | --- | --- | --- |
| `bundle.min.js` | [ricky0123/vad](https://github.com/ricky0123/vad), npm `@ricky0123/vad-web` | 0.0.31 | ISC |
| `silero-vad.bin` (`silero_vad_legacy.onnx`) | [Silero VAD](https://github.com/snakers4/silero-vad), distributed by `@ricky0123/vad-web` | package 0.0.31 | MIT |
| `ort.wasm.min.js`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.wasm` | [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | 1.20.1 | MIT |

The detector marks likely **speech activity** in each source once when loaded. This is not source separation: within a speech interval, Fish follows that clip's original mixed amplitude. Singing may not be recognized as speech. When no speech is detected, Fish uses a pitched/onset energy proxy, then overall energy. The fallback is not instrument or solo isolation. If the model cannot load, source audio remains usable and Fish uses the fallback.

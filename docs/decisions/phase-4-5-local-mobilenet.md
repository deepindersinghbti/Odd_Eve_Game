# Phase 4.5 local MobileNet loading

> Superseded: gameplay now uses the browser-native geometric silhouette pipeline
> documented in `docs/gesture-model.md`. The model runtime and assets were removed.

The gesture recognizer vendors the official TensorFlow.js MobileNet V1 alpha
0.25 LayersModel and loads it with the TensorFlow.js Layers/Core APIs. The
installed `@tensorflow-models/mobilenet` package remains the reference model
implementation, but its custom-model URL path loads a GraphModel and therefore
cannot load this official LayersModel artifact.

The runtime imports only TensorFlow.js Core, Layers, WebGL, and CPU backends.
This keeps converter-only TFHub support out of the browser bundle and makes the
offline-runtime audit literal: production code contains no external model host.
The inspected `global_average_pooling2d_1` layer produces the 256-value feature
embedding consumed by the KNN classifier.

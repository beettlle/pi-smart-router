## Cross-link: typed judgment as an alternative requirement source

Typed-judgment epic: {{EPIC}}.

{{T6}} adds `hydra.requirements_source: "projection" | "jev"`. With `jev`, HyDRA's `{ reasoning, code_gen, tool_use }` vector comes from a Jev-compatible judge (local OpenJev by default) instead of the encoder + learned projection. No training is needed, and the MiniLM 512-token truncation does not apply.

{{T8}} measures it against the current projection on the TwinRouterBench corpus and counterfactual replay, and produces a decision artifact.

**Request:** hold encoder / head / calibration default decisions on this issue until {{T8}} reports, since the outcome may change what is worth promoting. This comment does not change this issue's acceptance criteria.

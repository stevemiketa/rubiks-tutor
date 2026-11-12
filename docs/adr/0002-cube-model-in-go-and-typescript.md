# The cube model lives in both Go and TypeScript

The browser needs its own cube model to apply and animate Moves instantly, and the Go backend needs one to compute Solutions and to check Snapshots before saving them. We accept having the model in two languages rather than moving solving into the browser, because solving is the heart of the app and benefits from Go's testing. Both implementations run one shared set of test cases, each a Move sequence plus the Cube state it produces, so the two models can't silently drift apart.

## Consequences

Any change to Moves or notation has to update both implementations and the shared test cases in the same change.

# Share links point to server-stored, content-addressed Snapshots

As in the Go playground, sharing saves a Snapshot on the server under a short ID derived from a hash of its contents, and the link is `/s/{id}`. Identical Snapshots get the same ID. Snapshots are kept forever so that links never break, which means the store can't be dropped or wiped without breaking every link anyone has shared.

## Considered Options

- **Encoding the Snapshot in the URL**: a 200-Move history fits in about 170 characters and needs no storage. We rejected it because the links are long and the goal was short links like the Go playground's.

import { makeTestPlugin } from "../../makeTestPlugin";

// Alphabetically first of the two folders sharing the name "dup-name" — this
// one must win and register; it is also the surviving valid plugin this
// scenario proves the collision does not block.
export default makeTestPlugin({ name: "dup-name" });

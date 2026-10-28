Fixture for `src/domains/formats/adapters/node-project-files.test.ts`.

Byte-exact on purpose (see `.gitattributes`): `docs/index.md` has a UTF-8 BOM and CRLF line
endings, and `node_modules/` must never be listed. Symlink cases are created by the test in a
temporary folder, so the repository stays portable.

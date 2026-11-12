# Vendored

`three/` is three.js **r185 (0.185.1)**, MIT (`three/LICENSE`). It was copied
unmodified from a copy already installed in Adem's ARSENAL repository; nothing
was downloaded.

`addons/` holds three of three.js's example modules: `SimplexNoise`,
`BufferGeometryUtils` and `Reflector`. Their only edit is the import specifier,
`'three'` → `'../three.module.js'`, so they load without a bundler.

The hashes are in `VENDOR_HASHES.txt` (re-verified 2026-11-12).

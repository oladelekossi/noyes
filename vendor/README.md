# vet source snapshot

- Upstream: https://github.com/gdevillele/vet
- Commit: `8aae49803b7cb6b0c1f84e96b33757a31bea3dd8`
- Package: `implementations/typescript`, version `0.1.0-dev`
- Archive SHA-256: `c4018cbd90cd7ff7e1674bfa36726117156d869ac5c49d47e864e9468d80d672`
- License: MIT, included inside the archive.

The upstream repository has no root npm package. This local npm tarball contains the unmodified TypeScript runner sources and their compiled JavaScript so `npm ci` can install the exact runner without a Git clone or TypeScript build. It is a development dependency and is not included in the extension ZIP.

To rebuild from the pinned upstream commit:

```sh
git clone https://github.com/gdevillele/vet.git
git -C vet checkout 8aae49803b7cb6b0c1f84e96b33757a31bea3dd8
cd vet/implementations/typescript
npm ci --ignore-scripts
npm run build
cp ../../LICENSE LICENSE
npm pkg set 'files[0]=dist' 'files[1]=src' 'files[2]=bin' 'files[3]=LICENSE' 'files[4]=README.md'
npm pack --ignore-scripts
```

The packaging-only changes add the root license and a `files` allowlist to include compiled output. No upstream rules or analyzer code were changed. noyes's npm lockfile records the tarball integrity and exact installed dependency versions.

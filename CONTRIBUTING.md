# Contributing to Lattice Lab

Thanks for helping improve the prototype. Bug reports, reproducible observations, documentation improvements, and focused code changes are welcome. The original project code is licensed under [MIT](LICENSE); third-party components retain their own terms.

## Reporting an issue

Use the issue templates when the repository is hosted on GitHub. Include the browser and operating system, the input format and approximate mesh size, the lattice settings, the expected and actual result, and steps to reproduce. Attach a minimal part or saved project only if you have permission to share it. Project files contain the source geometry.

For performance reports, include whether WebGL is available, the input and output triangle counts, and the generation time shown in the editor. A screenshot or short recording helps when the problem is visual.

## Checking a change locally

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Keep new behavior covered by a focused test when a numerical result, file format, or saved project state is affected. Document approximation limits and measured behavior rather than promising manufacturing or simulation accuracy.

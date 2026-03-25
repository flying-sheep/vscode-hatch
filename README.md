# Hatch Code
An extension to manage [Hatch environments] through [`vscode-python-environments`][].

To make use of it, make sure your user settings contain `"python.useEnvironmentsExtension": true`.

[hatch environments]: https://hatch.pypa.io/latest/tutorials/environment/basic-usage/
[`vscode-python-environments`]: https://github.com/microsoft/vscode-python-environments/#readme

## Features
- List all configured [Hatch environments]
- Provide controls to set them as active environment for your project, activate them in a terminal, and remove them[^1]
- Temporarily[^2] modify an environment’s packages using the configured [`installer`]

[^1]: “remove” in this context means deleting it on disk, it will stay listed and will be recreated when interacting with it.
[^2]: since many actions currently use `hatch run` and therefore sync the environment, e.g. removing a package that is pulled in as a dependency will not persist for long.

[`installer`]: https://hatch.pypa.io/latest/how-to/environment/select-installer/

## Extension Settings
TODO

## Limitations
- It’s pretty unclear which environments exist on disk and which don’t
- We list internal envs that users don’t usually interact with, such as `hatch-uv` and `hatch-build`
- [Terminal activation is slow](https://github.com/microsoft/vscode-python-environments/issues/1391)

## Release Notes
### 0.0.1
Unreleased

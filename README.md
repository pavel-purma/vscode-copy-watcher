# Copy Watcher - README

This extension mirror file changes to other folder.


## Features

Copy changed files from source to destination folder. Included files must match to filter (array of globs, minimatch expressions).
At the start this extension can copy all newer files. It can copy them from both sides (source => destination and even destination => source).
This's handy for project's shared component which can be placed in other git repository.


## Extension Settings

This extension contributes the following settings:

* `copyWatcher.sections`: Array of copy and watch definition (source and destination)

Copy watch definition properties:

* `source`: Source folder (relative to workspace root folder)
* `destination`: Destination folder (relative to workspace root folder)
* `destinationRequired`: This copy definition will be active only if destination folder exists (default true)
* `includes`: Array of minimatch filters
* `excludes`: Array of minimatch filters which are applied in negative way
* `initialCopy`: Copy all newer files when extension started (default false)
* `initialCopyBothSides`: Same as initialCopy but files are copied in opposite direction (default false)
* `deleteEnabled`: Delete of source file will be applied to destination file (default false)


Example:
```
"copyWatcher.sections": [
    {
        "source": "Components/Component",
        "destination": "../../ComponentRepository/Component",
        "destinationRequired: true,
        "includes": [
            "/**/*.js"
        ],
        "excludes": [
            "node_modules/**/*"
        ],
        "initialCopy": true,
        "initialCopyBothSides": true,
        "deleteEnabled": true
    }
]
```

## Contribution

Fork the [repository](https://github.com/pavel-purma/vscode-copy-watcher) and submit pull requests.


## Release Notes

### 1.0.0

Initial release

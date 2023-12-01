# Storyblok Backup CLI

[![npm version](https://img.shields.io/npm/v/storyblok-backup.svg)](https://www.npmjs.com/package/storyblok-backup)
[![license](https://img.shields.io/github/license/webflorist/storyblok-backup)](https://github.com/webflorist/storyblok-backup/blob/main/LICENSE)

A npx CLI tool to create a full backup of a space of the [Storyblok CMS](https://www.storyblok.com).

The script will fetch the following resources of a Storyblok space using the Management API and archive them in a zip file:

- Stories
- Components
- Component groups
- Assets (optionally incl. original files)
- Asset folders
- Datasources (incl. entries)
- Space
- Space Roles
- Tasks
- Activities
- Presets
- Field types
- Workflow stages
- Workflow stage changes
- Custom workflows
- Releases

## Installation

```shell

# simply auto-download and run via npx
$ npx storyblok-backup

# or install globally
$ npm install -g storyblok-backup

# or install for project using npm
$ npm install storyblok-backup

# or install for project using yarn
$ yarn add storyblok-backup

# or install for project using pnpm
$ pnpm add storyblok-backup
```

## Usage

Call `npx storyblok-backup` with the following options:

### Options

```text
--token <token>     (required) Personal OAuth access token created
                    in the account settings of a Stoyblok user.
                    (NOT the Access Token of a Space!)
--space <space_id>  (required) ID of the space to backup
--with-asset-files  Downloads all files (assets) of the space. Defaults to false.
--output-dir <dir>  Directory to write the backup to. Defaults to ./.output
                    (ATTENTION: Will fail if the directory already exists!)
--force             Force deletion and recreation of existing output directory.
--create-zip        Create a zip file of the backup. Defaults to false.
--zip-prefix <dir>  Prefix for the zip file. Defaults to 'backup'.
                    (The suffix will automatically be the current date.)
--verbose           Will show detailed output for every file written.
--help              Show this help
```

### Minimal example

```shell
npx storyblok-backup --token 1234567890abcdef --space 12345
```

This will create the folder `./.output` and fetch all resources sorted into folders.

### Maximal example

```shell
npx storyblok-backup \
    --token 1234567890abcdef \
    --space 12345 \
    --with-asset-files \
    --output-dir ./my-dir \
    --force \
    --create-zip \
    --zip-prefix daily \
    --verbose
```

This will create the folder `./my-dir`, fetch all resources (incl. the original file assets) sorted into folders, zip them to `./my-dir/daily-Y-m-d-H-i-s.zip`, and log every written file to console.

## Continuous Integration

You can e.g. use this script to create periodic backups of Storyblok spaces using GitHub Actions and artifacts.

Here would be an example for a weekly backup, that removes the artifacts/backups from previous runs and uploads a new one:

```yaml
name: Weekly Storyblok Backup

on:
  schedule:
    - cron: '0 0 * * 0'

jobs:
  backup:
    runs-on: ubuntu-latest
    permissions:
      actions: write

    steps:
      - name: Perform Backup
        env:
          STORYBLOK_OAUTH_TOKEN: ${{ secrets.STORYBLOK_OAUTH_TOKEN }}
          STORYBLOK_SPACE_ID: ${{ secrets.STORYBLOK_SPACE_ID }}
        run: npx storyblok-backup --token $STORYBLOK_OAUTH_TOKEN --space $STORYBLOK_SPACE_ID --create-zip

      - name: Delete Old Artifacts
        uses: actions/github-script@v6
        id: artifact
        with:
          script: |
            const res = await github.rest.actions.listArtifactsForRepo({
                owner: context.repo.owner,
                repo: context.repo.repo,
            })

            res.data.artifacts
                .filter(({ name }) => name === 'weekly-backup')
                .forEach(({ id }) => {
                  github.rest.actions.deleteArtifact({
                      owner: context.repo.owner,
                      repo: context.repo.repo,
                      artifact_id: id,
                  })
                })

      - name: Copy Artifact
        run: mkdir artifact && cp ./.output/*.zip artifact

      - name: Upload Artifact
        uses: actions/upload-artifact@v3
        with:
          name: weekly-backup
          path: artifact
```

Make sure, to set the secrets `STORYBLOK_OAUTH_TOKEN` and `STORYBLOK_SPACE_ID` in your repository settings.

Note that artifact manipulation requires the `actions: write` permission for the workflow. The workflow above has this permission set already.

If you create multiple workflows for daily, weekly and monthly backups, by changing the cron-schedule and the two occurrences of the artifact name `weekly-backup`, you will always have exactly one daily, weekly and monthly backup.

Also keep in mind, that there is a limit on artifact storage and runner minutes ([see GitHub docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions#included-storage-and-minutes)).

## License

This package is open-sourced software licensed under the [MIT license](https://github.com/webflorist/storyblok-backup/blob/main/LICENSE.).

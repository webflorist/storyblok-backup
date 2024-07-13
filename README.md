# Storyblok Backup CLI

[![npm version](https://img.shields.io/npm/v/storyblok-backup.svg)](https://www.npmjs.com/package/storyblok-backup)
[![license](https://img.shields.io/github/license/webflorist/storyblok-backup)](https://github.com/webflorist/storyblok-backup/blob/main/LICENSE)

A npx CLI tool to create a full backup of a space of the [Storyblok CMS](https://www.storyblok.com).

A restore tool to restore (create or update) resources is also included.

The backup script will fetch the following resources of a Storyblok space using the Management API and archive them in a zip file:

- Stories
- Collaborators
- Components
- Component groups
- Assets (optionally incl. original files)
- Asset folders
- Internal Tags
- Datasources (incl. entries)
- Space
- Space Roles
- Tasks
- Activities
- Presets
- Field types
- Webhooks
- Workflows
- Workflow stages
- Workflow stage changes
- Releases
- Pipeline Branches
- Access Tokens

The restore script is able to individually restore the the resources from the backup files (via update or create) with the following exceptions:

- Assets: Creating assets is not supported
- Tasks: Currently not supported due to missing fields returned from management API
- Field types: Currently not supported
- Workflow stage changes: No update possible
- Access Tokens: Creating access tokens from backup makes no sense, since it will result in a new token-string.

## Installation

```shell

# simply auto-download and run via npx
## for backup:
$ npx storyblok-backup
## for restore:
$ npx -p storyblok-backup storyblok-restore

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

### Backup

Call `npx storyblok-backup` with the following options:

#### Backup options

```text
--token <token>     (required) Personal OAuth access token created
                    in the account settings of a Stoyblok user.
                    (NOT the Access Token of a Space!)
                    Alternatively, you can set the STORYBLOK_OAUTH_TOKEN environment variable.
--space <space_id>  (required) ID of the space to backup
                    Alternatively, you can set the STORYBLOK_SPACE_ID environment variable.
--region <region>   Region of the space. Possible values are:
                    - 'eu' (default): EU
                    - 'us': US
                    - 'ap': Australia
                    - 'ca': Canada
                    - 'cn': China
                    Alternatively, you can set the STORYBLOK_REGION environment variable.
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

OAuth token, space-id and region can be set via environment variables. You can also use a `.env` file in your project root for this (see `.env.example`).

#### Minimal backup example

```shell
npx storyblok-backup --token 1234567890abcdef --space 12345
```

This will create the folder `./.output/backup` and fetch all resources sorted into folders.

#### Maximal backup example

```shell
npx storyblok-backup \
    --token 1234567890abcdef \
    --space 12345 \
    --region ap \\
    --with-asset-files \
    --output-dir ./my-dir \
    --force \
    --create-zip \
    --zip-prefix daily \
    --verbose
```

This will create the folder `./my-dir/backup`, fetch all resources (incl. the original file assets) sorted into folders, zip them to `./my-dir/daily-Y-m-d-H-i-s.zip`, and log every written file to console.

#### Continuous backup integration

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
        run: npx storyblok-backup --token $STORYBLOK_OAUTH_TOKEN --space $STORYBLOK_SPACE_ID

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

      - name: Upload Artifact
        uses: actions/upload-artifact@v3
        with:
          name: weekly-backup
          path: .output
```

Make sure, to set the secrets `STORYBLOK_OAUTH_TOKEN` and `STORYBLOK_SPACE_ID` in your repository settings.

Note that artifact manipulation requires the `actions: write` permission for the workflow. The workflow above has this permission set already.

If you create multiple workflows for daily, weekly and monthly backups, by changing the cron-schedule and the two occurrences of the artifact name `weekly-backup`, you will always have exactly one daily, weekly and monthly backup.

Also keep in mind, that there is a limit on artifact storage and runner minutes ([see GitHub docs](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions#included-storage-and-minutes)).

### Restore

Call `npx -p storyblok-backup storyblok-restore` with the following options:

#### Restore options

```text
--token <token>     (required) Personal OAuth access token created
                    in the account settings of a Stoyblok user.
                    (NOT the Access Token of a Space!)
                    Alternatively, you can set the STORYBLOK_OAUTH_TOKEN environment variable.
--space <space_id>  (required) ID of the space to backup
                    Alternatively, you can set the STORYBLOK_SPACE_ID environment variable.
--region <region>   Region of the space. Possible values are:
                    - 'eu' (default): EU
                    - 'us': US
                    - 'ap': Australia
                    - 'ca': Canada
                    - 'cn': China
                    Alternatively, you can set the STORYBLOK_REGION environment variable.
--type <type>       (required) Type of resource to restore. Possible values are:
                    - 'story'
                    - 'collaborator'
                    - 'component'
                    - 'component-group'
                    - 'asset'
                    - 'asset-folder'
                    - 'internal-tag'
                    - 'datasource'
                    - 'datasource-entries'
                    - 'space'
                    - 'space-role'
                    - 'preset'
                    - 'webhook'
                    - 'workflow'
                    - 'workflow-stage'
                    - 'release'
                    - 'pipeline-branch'
                    - 'access-token
--file <file>       (required) File of resource to restore.
--publish           Perform a publish after restore of a story (default=false).
--create            Create a new resource instead of updating (default=false).
                    Not supported for assets.
--id <file>         (required if type=datasource-entries and create is set)
                    ID of datasource the entries belong to.
--verbose           Will show detailed result of the restore process.
--help              Show this help
```

#### Minimal restore example

```shell
npx -p storyblok-backup storyblok-restore --token 1234567890abcdef --space 12345 --type story --file ./.output/backup/123456789.json
```

This will restore the story from the stated file by updating it.

#### Maximal restore example

```shell
npx -p storyblok-backup storyblok-restore \
  --token 1234567890abcdef \
  --space 12345 \
  --region ap \
  --type story \
  --file ./.output/backup/123456789.json \
  --publish \
  --create \
  --verbose
```

This will restore the story by creating a new story, immediately publish it, and log the API result to console.

## License

This package is open-sourced software licensed under the [MIT license](https://github.com/webflorist/storyblok-backup/blob/main/LICENSE.).

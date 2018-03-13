# sequelize-auto-migrations-ng
Migration generator for sequelize. This is a fork from https://github.com/flexxnn/sequelize-auto-migrations

This package provides one tool:
* `makemigration` - tool for create new migrations

## Install
Until there is a proper npm release, you can use
`npm install manuelvillar/sequelize-auto-migrations-ng`

## Usage
* Init sequelize, with sequelize-cli, using `sequelize init`
* Create your models
* Create initial migration - run:

`node ./node_modules/sequelize-auto-migrations/bin/makemigration --name <migration name>`
* Change models and run it again, model difference will be saved to the next migration

To preview new migration, without any changes, you can run:

`node ./node_modules/sequelize-auto-migrations/bin/makemigration --preview`

`makemigration` tool creates `_current.json` file in `migrations` dir, that is used to calculate difference to the next migration. Do not remove it!

To create and then execute migration, use:
`makemigration --name <name> -x`

## Executing migrations
* Use standard sequelize-cli 
`sequelize db:migrate`
* To start from a revision, use `--from <name>`
* If migration fails, you can continue, use `--from <name>`
* To prevent execution next migrations, use `--to <name>`


For more information, use `makemigration --help`, `sequelize --help db:migrate`

## TODO:
* Remove `_current.json` file from `migrations` dir.
* Migration action sorting procedure need some fixes. When many foreign keys in tables, there is a bug with action order. Now, please check it manually (`--preview` option)
* Need to check (and maybe fix) field types: `BLOB`, `RANGE`, `ARRAY`, `GEOMETRY`, `GEOGRAPHY`
* Downgrade is not supported, add it
* This module tested with postgresql (I use it with my projects). Test with mysql and sqlite.

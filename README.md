# sequelize-auto-migrations-ng
Migration generator for sequelize. This is a fork from https://github.com/flexxnn/sequelize-auto-migrations

This package provides one tool:
* `makemigration` - tool for create new migrations

## Install
`npm install sequelize-auto-migrations-ng`

## Usage
* Init sequelize, with sequelize-cli, using `sequelize init`
* Create your models
* Create initial migration - run:

`node ./node_modules/sequelize-auto-migrations/bin/makemigration --name <migration name>`
* Change models and run it again, the migration file will be modified, it won't create a new one until you actually execute the migration.

  You can change this behavior using `-k` option and a different name for the migration.
* To preview new migration, without writing any changes, you can run:

`node ./node_modules/sequelize-auto-migrations/bin/makemigration --preview`

`makemigration` tool creates a table, `SequelizeMetaMigrations` in your database, that is used to calculate difference to the next migration. Do not remove it!


## Executing migrations
* Use standard sequelize-cli
`sequelize db:migrate`
* To start from a revision, use `--from <name>`


For more information, use `makemigration --help`, `sequelize --help db:migrate`

## TODO:
* Migration action sorting procedure need some fixes. When many foreign keys in tables, there is a bug with action order. Now, please check it manually (`--preview` option)
* Need to check (and maybe fix) field types: `BLOB`, `RANGE`, `GEOMETRY`, `GEOGRAPHY`
* Downgrade is not supported, add it
* This module tested with postgresql (I use it with my projects). Test with mysql and sqlite.

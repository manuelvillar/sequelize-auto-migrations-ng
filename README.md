[![NPM](https://nodei.co/npm/sequelize-auto-migrations-ng.png?compact=true)](https://nodei.co/npm/sequelize-auto-migrations-ng/)

# sequelize-auto-migrations-ng
Migration generator for sequelize with true migrations in database.

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

You could add these 2 scripts to `package.json`:

```
"scripts": {
    ...
    "migrate": "DEBUG=* node ./node_modules/.bin/sequelize db:migrate  --debug",
    "makemigrations": "DEBUG=* node ./node_modules/sequelize-auto-migrations-ng/bin/makemigration -d -v ",
```

And then use

```
npm run makemigration -- --name initial_version
npm run migrate
```


## Executing migrations
* Use standard sequelize-cli
`sequelize db:migrate`
* To start from a revision, use `--from <name>`

## Reverting migrations
* Use standard sequelize-cli
`sequelize db:migrate:undo`

For more information, use `makemigration --help`, `sequelize --help db:migrate`

## TODO:
* Migration action sorting procedure need some fixes. When many foreign keys in tables, there is a bug with action order. For now, please check it manually (`--preview` option)
* Need to check (and maybe fix) field types: `BLOB`, `RANGE`, `GEOMETRY`, `GEOGRAPHY`
* This module has been tested with postgresql (I use it with my projects). Test with mysql and sqlite.

## Credits
This is a fork from https://github.com/flexxnn/sequelize-auto-migrations

#!/bin/node

const commandLineArgs = require('command-line-args');
const beautify = require('js-beautify').js_beautify;
const Sequelize = require('sequelize');

const migrate = require('../lib/migrate');

const path = require('path');
const _ = require('lodash');

const optionDefinitions = [
  {
    name: 'preview', alias: 'p', type: Boolean, description: 'Show migration preview (does not change any files)',
  },
  {
    name: 'name', alias: 'n', type: String, description: 'Set migration name (default: "noname")',
  },
  {
    name: 'comment', alias: 'c', type: String, description: 'Set migration comment',
  },
  {
    name: 'execute', alias: 'x', type: Boolean, description: 'Create new migration and execute it',
  },
  { name: 'migrations-path', type: String, description: 'The path to the migrations folder' },
  { name: 'models-path', type: String, description: 'The path to the models folder' },
  {
    name: 'verbose', alias: 'v', type: Boolean, description: 'Show details about the execution',
  },
  {
    name: 'debug', alias: 'd', type: Boolean, description: 'Show error messages to debug problems',
  },
  {
    name: 'keep-files', alias: 'k', type: Boolean, description: 'Don\'t delete previous files from the current revision (requires a unique --name option for each file)',
  },
  {
    name: 'help', alias: 'h', type: Boolean, description: 'Show this message',
  },
];

const options = commandLineArgs(optionDefinitions);

if (options.help) {
  console.log('Sequelize migration creation tool\n\nUsage:');
  optionDefinitions.forEach((option) => {
    const alias = (option.alias) ? ` (-${option.alias})` : '\t';
    console.log(`\t --${option.name}${alias} \t${option.description}`);
  });
  process.exit(0);
}

const migrationsDir = path.join(process.env.PWD, options['migrations-path'] || 'migrations');
const modelsDir = path.join(process.env.PWD, options['models-path'] || 'models');

// current state
const currentState = {
  tables: {},
};

// load last state
let previousState = {
  revision: 0,
  version: 1,
  tables: {},
};


const { sequelize } = require(modelsDir); /* eslint import/no-dynamic-require: off */

if (!options.debug) sequelize.options.logging = false;

const queryInterface = require(modelsDir).sequelize.getQueryInterface();
const { models } = sequelize;

// This is the table that sequelize uses
queryInterface.createTable('SequelizeMeta', {
  name: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
    primaryKey: true,
  },
}).then(() => {
  queryInterface.createTable('SequelizeMetaMigrations', {
    revision: {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true,
      primaryKey: true,
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    state: {
      type: Sequelize.JSON,
      allowNull: false,
    },
  }).then(() => {
  // We get the state at the last migration executed
    sequelize.query('SELECT name FROM "SequelizeMeta" ORDER BY "name" desc limit 1', { type: sequelize.QueryTypes.SELECT })
      .then(([lastExecutedMigration]) => {
        sequelize.query(`SELECT state FROM "SequelizeMetaMigrations" where "revision" = '${lastExecutedMigration === undefined ? -1 : lastExecutedMigration.name.split('-')[0]}'`, { type: sequelize.QueryTypes.SELECT })
          .then(([lastMigration]) => {
            if (lastMigration !== undefined) previousState = lastMigration.state;

            currentState.tables = migrate.reverseModels(sequelize, models);

            const actions = migrate.parseDifference(previousState.tables, currentState.tables);

            const downActions = migrate.parseDifference(currentState.tables, previousState.tables);

            // sort actions
            migrate.sortActions(actions);
            migrate.sortActions(downActions);

            const migration = migrate.getMigration(actions);
            const tmp = migrate.getMigration(downActions);

            migration.commandsDown = tmp.commandsUp;

            if (migration.commandsUp.length === 0) {
              console.log('No changes found');
              process.exit(0);
            }

            // log migration actions
            _.each(migration.consoleOut, (v) => { console.log(`[Actions] ${v}`); });

            if (options.preview) {
              console.log('Migration result:');
              console.log(beautify(`[ \n${migration.commandsUp.join(', \n')} \n];\n`));
              console.log('Undo commands:');
              console.log(beautify(`[ \n${migration.commandsDown.join(', \n')} \n];\n`));
              process.exit(0);
            }

            // Bump revision
            currentState.revision = previousState.revision + 1;

            migrate.pruneOldMigFiles(currentState.revision, migrationsDir, options).then(() => {
              // write migration to file
              const info = migrate.writeMigration(
                currentState.revision,
                migration,
                migrationsDir,
                (options.name) ? options.name : 'noname',
                (options.comment) ? options.comment : '',
              );

              console.log(`New migration to revision ${currentState.revision} has been saved to file '${info.filename}'`);

              // save current state
              // Ugly hack, see https://github.com/sequelize/sequelize/issues/8310
              const rows = [{
                revision: currentState.revision,
                name: info.info.name,
                state: JSON.stringify(currentState),
              }];

              queryInterface.bulkDelete('SequelizeMetaMigrations', { revision: currentState.revision })
                .then(() => {
                  queryInterface.bulkInsert('SequelizeMetaMigrations', rows)
                    .then(() => {
                      if (options.verbose) console.log('Updated state on DB.');
                      if (options.execute) {
                        console.log(`Use sequelize CLI:
    sequelize db:migrate --to ${currentState.revision}-${info.info.name} ${options['migrations-path'] ? `--migrations-path=${options['migrations-path']}` : ''} ${options['models-path'] ? `--models-path=${options['models-path']}` : ''}`);
                        process.exit(0);
                      } else { process.exit(0); }
                    }).catch((err) => { if (options.debug) console.error(err); });
                }).catch((err) => { if (options.debug) console.error(err); });
            });
          }).catch((err) => { if (options.debug) console.error(err); });
      }).catch((err) => { if (options.debug) console.error(err); });
  }).catch((err) => { if (options.debug) console.error(err); });
}).catch((err) => { if (options.debug) console.error(err); });

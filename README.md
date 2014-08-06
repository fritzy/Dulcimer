#Dulcimer

Dulcimer is an ORM for an embedded keystore in your Node.js app.
The aim is to provide a consistent way of working with keystores that enables enjoyable development.

Riak can be a pain to run on your dev machine. Why not develop against level and deploy against Riak without sacrificing features or the speed of native indexing?

Because when all you have is a hammer, everything looks like a Dulcimer.

Features Include:

* Models
* Ordered Objects
* Lookup by Index
* Retrieving Models sorted by Index
* Retrieve index ranges
* Retrieve with filters
* Foreign Keys and Foreign Collections
* Children
* Pagination
* Counts
* Buckets
* onSave & onDelete Model Events
* derived fields
* field types and validation

The models in this ORM use [VeryModel](https://github.com/fritzy/verymodel). Dulcimer models extend the definitions and methods.

We currently support Riak and Levelup backends. Redis coming soon.

:ledger: [Licensed MIT](https://github.com/fritzy/Dulcimer/blob/master/LICENSE)

## A Quick Example

```js
var dulcimer = require('dulcimer');

dulcimer.connect('./test.db'); //for level
//dulcimer.connect({type: 'riak', host: 'localhost', port: 8087, bucket: 'somebucket'}); //for riak
//dulcimer.connect({type: 'level', path: './test.db'}); //alt for level

var PersonFactory = new dulcimer.Model({
    firstName: {},
    lastName: {},
    fullName: {derive: function () {
        return this.firstName + ' ' + this.lastName;
    }},
}, {name: 'person'});

var nathan = PersonFactory.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});
nathan.save(function (err) {
    PersonFactory.all(function (err, persons) {
        persons.forEach(function (person) {
            console.dir(person.toJSON());
        });
    });
});
```

## Coming Soon

* Redis Support
* Riak Sibling Resolution
* Import/Export/Transform
* Write Streams
* IndexDB in Browsers
* Patterns Documentation
* Query and sort against multiple indexes at once
* Rebuilding Indexes
* More advanced foreign keys / collections

## Index

* [Installing](#installing)
* [Connecting to the Database](#connecting)
    * [Globally Connect To Level](#conn-level)
    * [Globally Connect To Riak](#conn-riak)
    * [Connect Based on on Configuration](#conn-from-config)
    * [Connecting per Model](#conn-per-model)
    * [Override Connection per Command](#conn-per-comm)
* [Defining a Model](#defining-a-model-factory)
    * [type](#def-type)
    * [validate](#def-validate)
    * [processIn](#def-processIn)
    * [processOut](#def-processOut)
    * [onSet](#def-onSet)
    * [derive](#def-derive)
    * [index](#def-index)
    * [foreignKey](#def-foreignKey)
    * [foreignKeys](#def-foreignKeys)
    * [foreignCollection](#def-foreignCollection)
    * [required](#def-required)
    * [default](#def-default)
    * [save](#def-save)
    * [private](#def-private)
* [Model Options](#model-options)
    * [name](#mo-name)
    * [db](#mo-db)
    * [bucket](#mo-bucket)
    * [onSave](#mo-onSave)
    * [onDelete](#mo-onDelete)
    * [savePrivate](#mo-savePrivate)
    * [saveKey](#mo-saveKey)
    * [foreignDepth](#mo-foreignDepth)
    * [keyType](#mo-keyType)
    * [keyGenerator](#mo-keyGenerator)
* [Options and Callbacks](#options-and-callbacks)
    * [db](#op-db)
    * [bucket](#op-bucket)
    * <del>[offset](#op-offset)</del>
    * [limit](#op-limit)
    * [continuation](#op-continuation)
    * [sortBy](#op-sortBy)
    * [indexValue](#op-indexValue)
    * [indexRange](#op-indexRange)
    * [index](#op-index)
    * [reverse](#op-reverse)
    * [filter](#op-filter)
    * [depth](#op-depth)
    * [ctx](#op-ctx)
    * [returnStream](#op-returnStream)
* [Model Factory Methods](#model-factory-methods)
    * [create](#create)
    * [get](#get)
    * [all](#all)
    * [update](#update)
    * [delete](#factory-delete)
    * [wipe](#wipe)
    * [getByIndex](#getByIndex)
    * [findByIndex](#findByIndex)
    * [allSortByIndex](#allSortByIndex)
    * [getTotal](#getTotal)
    * [runWithLock](#runWithLock)
* [Model Instance Methods](#model-instance-methods)
    * [save](#save)
    * [delete](#delete)
    * [addForeign](#addForeign)
    * [removeForeign](#removeForeign)
    * [getForeign](#getForeign)
    * [getReverseForeign](#getReverseForeign)
    * <del>[createChild](#createChild)</del>
    * <del>[getChild](#getChild)</del>
    * <del>[getChildren](#getChildren)</del>
    * <del>[getChildrenByIndex](#getChildrenByIndex)</del>
    * <del>[findChildByIndex](#findChildByIndex)</del>
    * [toJSON](#toJSON)
    * [toString](#toString)
    * [diff](#diff)
    * [getChanges](#getChanges)
    * [getOldModel](#getOldModel)
    * [loadData](#loadData)

## Installing

`npm install dulcimer`

<a name="connecting"></a>
### Connecting to a Database

<a name="conn-level"></a>
#### Connecting to Level for All Models

Shorthand, just call connect with a string path.

```javascript
var dulcimer = require('dulcimer');

dulcimer.connect('/some/file/path/to/level');
```

Or pass a more detailed object, maybe from your config file, to make it easier to switch to Riak with just a configuration change.

```javascript
var dulcimer = require('dulcimer');

dulcimer.connect({
    type: 'level',
    path: '/some/file/path/to/level',
    bucket: 'defaultbucket'
});
```

<a name="conn-riak"></a>
#### Connecting to Riak for All Models
```
var dulcimer = require('dulcimer');

dulcimer.connect({
    type: 'riak',
    host: 'localhost',
    port: 8087, //riak protocol buffer port
    bucket: 'somebucket', //default bucket
});
```

<a name="conn-from-config"></a>
#### Connecting Based on Config

```
var duclimer = require('dulcimer');
var config = require('./config.json');

dulcimer.connect(config.database);
```

<a name="conn-per-model"></a>
#### Connecting Per Model

The same connect method also exists on Model Factories, which overrides your global connection.

```
var dulcimer = require('dulcimer');

var Person = new dulcimer.Model({
    first_name: {type: 'string'},
    last_name: {type: 'string'}
});

Person.connect({
    type: 'level',
    path: '/some/level/path'
});

var nathan = Person.create({
    first_name: 'Nathan',
    last_name: 'Fritz'
});

nathan.save(function (err) {
    console.log("Saved %j to %s", nathan.toJSON(), nathan.key);
});
```

<a name="conn-per-comm"></a>
#### Override Connection Per Command

The connect method returns a levelup-style object with custom extensions to use native-to-db indexes, counters, etc.

You can generate these manually using [level-dulcimer](https://github.com/fritzy/level-dulcimer) and [riak-dulcimer](https://github.com/fritzy/riak-dulcimer) (and soon redis-dulcimer).

```
var LevelDulcimer = require('level-dulcimer');

var db = LevelDulcimer('/some/level/path');
```

You can then use this database for the [db option](#op-db) in relevant commands.

## Defining a Model Factory
Model Factories define the platonic model, and can create model instances.
These models are extensions on [VeryModel](https://github.com/fritzy/verymodel).
Creating a new model factory involves passing two arguments: an object describing each field, and an options object defining the configuration of the model (leveldb path, model name, etc).

### Model Definitions

Every root property of a model definition is a field name with an object value defining types, restrictions, and processing for a model field. In it's simplest form, a field definition can just be an empty object, and then you can assign anything to that field. If a field isn't mentioned in the defition, it won't be saved or loaded.

#### Field Definition Properties

When making a model, you must define the fields in the model.
A field definition may be a simple empty `{}` if anything goes.

Most field definition properties that can be functions are called with the model instance as the `this` context.


* [type](#def-type)
* [validate](#def-validate)
* [processIn](#def-processIn)
* [processOut](#def-processOut)
* [onSet](#def-onSet)
* [derive](#def-derive)
* [index](#def-index)
* [foreignKey](#def-foreignKey)
* [foreignKeys](#def-foreignKeys)
* [foreignCollection](#def-foreignCollection)
* [required](#def-required)
* [default](#def-default)
* [save](#def-save)
* [private](#def-private)

<a name='def-type'></a>
__type__

A string which references a built in type.
Built in types include `string`, `array`, `integer`, `numeric`, `enum`, `boolean`.
Strings and arrays may have `min` and `max` values, both for validation, and max will truncate the results when saving or on `toJSON`.
Enums may include `values`, an array (and eventually a ECMAScript 6 set).

You can override any of the definition fields of a specified type. Validate, processIn, processOut, and onSet will use both the built-in and your override. The others will replace the definition field.

`type` does not need to be set at all. In fact, `{}` is a perfectly valid definition.

Example:

    {field: {type: 'string', max: 140}}


----

<a name='def-validate'></a>
__validate__

The `validate` field takes a value and should determine whether that value is acceptable or not. It's run during `doValidate()` or during `save` if you set the option `validateOnSave: true`.
The function should return a boolean, an array of errors, an empty array, or an error string.

Example:

```js
new dulcimer.Model({field: {
    validate: function (value) {
        //validate on even
        return (value % 2 === 0);
    }
});
```

----

<a name='def-processIn'></a>
__processIn__

`processIn` is a function that is passed a value on loading from the database, `create`, or `loadData`. It should return a value.

This function is often paired with `processOut` in order to make an interactive object when in model form, and a serialized form when saved.

`processIn` does not handle the case of direct assignment like `modelinst.field = 'cheese';`. Use `onSet` for this case.

Example:

```javascript
new dulcimer.Model({someDateField: {
    processIn: function (value) {
        return moment(value);
    },
})
```

----

<a name='def-processOut'></a>
__processOut__

`processOut` is a function that takes a value and returns a value, just like `processIn`, but is typically used to serialize the value for storage. It runs on `save()` and `toJSON()`.

Example:

```javascript
new dulcimer.Model({someDateField: {
    processOut: function (value) {
        return value.format(); //turn moment into string
    },
})
```

----

<a name='def-onSet'></a>
__onSet__

`onSet` is just like `processIn`, except that it only runs on direct assignment. It's a function that takes a value and returns a value.

Example:

```javascript
new dulcimer.Model({someDateField: {
    processIn: function (value) {
        return moment(value);
    },
    onSet: function (value) {
        if (moment.isMoment(value)) {
            return value;
        } else {
            return moment(value);
        }
    },
    processOut: function (value) {
        return value.format();
    },
})
```

----
<a name='def-index'></a>
__index__

When set to true, this field is indexed with every save.
This allows you to [getByIndex](#getByIndex), [findByIndex](#findByIndex) and the ability to use [sortBy](#op-sortBy) in various calls.

An indexed field of [type](#def-type) `'integer'` is indexed differently. Please make sure indexed numbers are of that type.

----

<a name='def-derive'></a>
__derive__

`derive` is a function that returns a value whenever the field is accessed (which can be quite frequent). The `this` context, is the current model instance, so you can access other fields.

Example:

```js
new dulcimer.Model({
    firstName: {type: 'string'},
    lastName: {type: 'string'},
    fullName: {
        type: 'string',
        derive: function () {
            return [this.firstName, this.lastName].join(" ");
        },
    }
});
```
:heavy\_exclamation\_mark: Warning! DO NOT REFERENCE THE DERIVE FIELD WITHIN ITS DERIVE FUNCTION! You will cause an infinite recursion. This is bad and will crash your program.

----

<a name='def-foreignKey'></a>
__foreignKey__

`foreignKey` should be a Model Factory or a string of the factory name.
These fields are saved as their key, but when loaded expanded out to be a model instance of the key's value.
`get` will load and expand `foreignKey`s and `foreignCollections` up to the `depth` option provided (which is 5 by default).

When assigning values to this field, you can either assign a model instance or a key string.

Example:

```js
new dulcimer.Model({
    comment: {type: 'string'},
    author: {foreignKey: 'user'},
});
```

---

<a name='def-foreignKeys'></a>
__foreignKeys__

`foreignKeys` should be a Model Factory or a string of the factory name.
Using foreignKeys will automatically set the [type](#def-type) to `array`.
Unlike [foreignKey](#def-foreignKey) and [foreignCollection](#def-foreignCollection), the key values are not stored in the object itself. This way you may add millions of foreign relationships with [addForeign](#addForeign) to any given key. This also means that you cannot edit the field to edit the relationships.

By default, this field will be populated by up to `10` foreign model instances. You can change that number with by setting an `autoLoad` key in the definition to another number.

To manipulate and load foreign relationships, use the following methods:

* [addForeign](#addForeign)
* [removeForeign](#removeForeign)
* [getForeign](#getForeign)
* [getReverseForeign](#getReverseForeign)

Example:

```js
new dulcimer.Model({
    post: {type: 'string'},
    contributors: {foreignKeys: 'user', autoLoad: 5},
});
```

----

<a name='def-foreignCollection'></a>
__foreignCollection__

`foreignCollection`'s are like `foreignKey`'s except they are of an array type.
Values are saved as an array of key strings, and expanded out by when the model is retrieved with `get` up to the default depth of 5 or overriden with `{depth: 24}` on the `get` command.

When assigning values to these fields, you may either assign an array of model instances or an array of key strings.

Example:

```js
new dulcimer.Model({
    comment: {type: 'string'},
    author: {foreignKey: 'user'},
    starredBy: {foreignCollection: 'user'}
});
```

----

<a name='def-required'></a>
__required__

`required` is a boolean, false by default.
A required field will attempt to bring in the `default` value if a value is not present.

Example:

```js
new dulcimer.Model({
    comment: {
        type: 'string',
        required: true,
        default: "User has nothing to say."
    },
    author: {foreignKey: 'user'},
    starredBy: {foreignCollection: 'user'}
});
```

----

<a name='def-default'></a>
__default__

`default` may be a value or a function. Default is only brought into play when a field is `required` but not assigned.
In function form, `default` behaves similiarly to `derive`, except that it only executes once.

```js
new dulcimer.Model({
    comment: {
        type: 'string',
        required: true,
        default: function () {
            return this.author.fullName + ' has nothing to say.';
        },
    },
    author: {foreignKey: 'user'},
    starredBy: {foreignCollection: 'user'}
});
```

:heavy\_exclamation\_mark: Warning! Assigning mutable objects as a default can result in the default getting changed over time.
When assigning objects, arrays, or essentially any advanced type, set default to a function that returns a new instance of the object.

----

<a name='def-save'></a>
__save__

`save` is a boolean, true by default which determines whether a field should be omitted during save or not.

It can be handy to not save derived fields.

Example:

```js
new dulcimer.Model({
    firstName: {type: 'string'},
    lastName: {type: 'string'},
    fullName: {
        type: 'string',
        derive: function () {
            return [this.firstName, this.lastName].join(" ");
        },
        save: false,
    }
});
```

---

<a name='def-private'></a>
__private__

`private` is a boolean, false by default, which determines whether a field is saved into the object upon [save](#save) and included in the object resulting from [toJSON()](#toJSON).

You can force private methods to be included in saved objects with the model option [savePrivate](#mo-savePrivate), while preserving [toJSON](#toJSON) omittion.

<a name="model-options"></a>
### Model Options

Model options are the second argument of the `VeryLevelModel` constructor.

Requirements:

* Models must have a name option.
* Models must have a db.
* Models may have a bucket. You may also define buckets elsewhere if dynamic.

__Note__: Multiple models can and should use the same bucket.
Multiple models SHOULD NOT use the same name.

Buckets are useful for seperating groups of data by access groups or other things.


Index:

* [name](#mo-name)
* [db](#mo-db)
* [bucket](#mo-bucket)
* [onSave](#mo-onSave)
* [onDelete](#mo-onDelete)
* [savePrivate](#mo-savePrivate)
* [saveKey](#mo-saveKey)
* [foreignDepth](#mo-foreignDepth)
* [keyType](#mo-keyType)
* [keyGenerator](#mo-keyGenerator)

Example:

```js
new dulcimer.Model({
        someField: {},
        someOtherField: {},
    },
    {
        name: 'person',
        db: level(__dirname + '/thisapp.db', {valueEncoding: 'json'}),
    }
);

```
<a name='mo-name'></a>
__name__

The name is required should be a short (one or two word) alphanumeric string with no spaces.
This name is used as a prefix within the key store, as well as a string reference to the Model Factory itself to prevent circular requirements.

----

<a name='mo-db'></a>
__db__

The db field should refer to a [LevelUp](https://github.com/rvagg/node-levelup) or compatible library connection.
The `valueEncoding` option must be 'json'.

---

<a name='mo-bucket'></a>
__bucket__

This is the default bucket name for the model. Each method that interacts with the underlying database may override the bucket.

---

<a name='mo-onSave'></a>
__onSave__

`{onSave: function (err, details, done) { } }`

The details object contains:

    {
        model: model-instance,
        changes: changes,
        ctx: ctx
    }


The `changes` property is an object of fields with 'then', 'now', and 'changed', values.

    {
        field1: {then: 'cheese', now: 'ham', changed: true},
        field2: {then: 'who', now: 'whom', changed: true}
    }


The `ctx` property is whatever you passed with the [ctx option](#op-ctx) to the [save method](#save).

If you require a full model instance of what used to be, do this:

    var oldmodel = details.model.getOldModel();

You must execute the done callback when done.

---

<a name='mo-onDelete'></a>
__onDelete__

`{onSave: function (err, details, donecb) { } }`

The details object contains:

    {
        ctx: ctx
    }

The `ctx` property is whatever you passed to with [ctx option](#op-ctx) to the [delete method](#delete).

You must execute the done callback.

---

<a name='mo-savePrivate'></a>
__savePrivate__

A boolean, false by default, to enable saving of [private](#def-private) fields.

---

<a name='mo-saveKey'></a>
__saveKey__

A boolean, false by default, to enabling saving the key field within the object.

---

<a name='mo-foreignDepth'></a>
__foreignDepth__

An integer, 5 by default, to use as the default option for [depth](#op-depth) in a [get](#get) call.
The represents the depth by which to expand foreign keys recursively during a get.

---

<a name='mo-keyType'></a>
__keyType__

When generating keys, Dulcimer makes a lexically incrementing key, so that keys are in order of insertion by default. To change this to another value set keyType. Right now, the only other option is `uuid`.

```js
{keyType: 'uuid'}
```

This will generate uuid-v4 based keys instead.

---

<a name='mo-keyGenerator'></a>
__keyGenerator__

If you want to override key generation with your own function, set it to keyGenerator.

The only argument is an error first callback that should pass a key.

```js
{keyGenerator: function (cb) {
    cb(false, "generate a unique key of some kind here");
}}
```

---

## Options and Callbacks

Most Model Factory and Model Instance methods require a callback.
Any method that does require a callback has an optional `options` object as the argument before the callback.

Most methods will take `db`, and `bucket` as options properties, which override the defaults set in `factory.options`.
Some methods will take pagination methods: `offset` and `limit`.
`save`, `update`, and `delete` methods can take a `ctx` object in options to pass on to the `factory.options.onSave` and `factory.options.onDelete` callbacks.

Callbacks are always required on functions that include them, and lead with an error-first approach.


:point\_up: Remember, options are always optional, meaning you don't have to the argument at all.

### Common Options

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [sortBy](#op-sortBy)
* [indexValue](#op-indexValue)
* [indexRange](#op-indexRange)
* [index](#op-index)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [ctx](#op-ctx)
* [returnStream](#op-returnStream)

<a name='op-db'></a>
__db__

This option overrides the current database defined with [options.db](#mo-db) for the current call.

----

<a name='op-bucket'></a>
__bucket__

This overrides the current bucket.

----

<a name='op-offset'></a>
__offset__

This skips `offset` number of entries in a read call.

:heavy\_exclamation\_mark: This is depricated (and potentially very resource intensive). Use [continuation](#op-continuation) tokens instead.

----

<a name='op-limit'></a>
__limit__

This limits the number of results in a read call.

----

<a name='op-continuation'></a>
__continuation__

This is the token given in the "page.token" information from a [all](#all) when [limit](#op-limit) is used.
Use this to page through the next set of limited results with the same query.

----

<a name='op-sortBy'></a>
__sortBy__

`sortBy` must be an indexed field. The results of a read call are sorted by the value of this field.
Sorted results should be much faster than sorting after retrieval, as indexes are presorted in the db.

----

<a name='op-indexValue'></a>
__indexValue__

Only get results from this indexed field with a specific value.
You must also specify the field with [index](#op-index).

----

<a name='op-indexRange'></a>
__indexRange__

Only get the results from this indexed field within a specific range (in order).

    {indexRange: {start: 'start value', end: 'end value'}}

You must also specify the field with [index](#op-index).

----

<a name='op-index'></a>
__index__

Index field to use for [indexRange](#op-indexRange) and [indexValue](#op-indexValue).

---

<a name='op-reverse'></a>
__reverse__

Boolean, when true, reverses the result order from a read call.

----

<a name='op-filter'></a>
__filter__

`filter` is a function that is given a model instance, and returns false to filter out the result, or true to keep the result. Model instances have expanded their foreign values yet.

Example:

```js
{filter: function (inst) {
        if (inst.lastName !== 'Fritz') {
            return false;
        }
        return true;
    }
}
```

----

<a name='op-depth'></a>
__depth__

`depth` is an integer, 5 by default, that determines how many recursive layers to expand [foreignKey](#def-foreignKey) and [foreignCollection](#def-foreignCollection) fields.

0 means means that it will not expand any keys.

----

<a name='op-ctx'></a>
__ctx__

Whater you assign to `ctx` will be passed to the resulting [onSave](#mo-onSave) or [onDelete](#onDelete) callbacks.

Useful for passing the user and other context from an HTTP API call to the model callbacks, and many other similar use cases.

----

<a name='op-returnStream'></a>
__returnStream__

A boolean, when true, causes a read function to return an object stream, and call the callback with the stream rather than the concatenated array of models.

----

<a name='model-factory-methods'></a>
## Model Factory Methods

* [create](#create)
* [get](#get)
* [all](#all)
* [update](#update)
* [delete](#factory-delete)
* [wipe](#wipe)
* [getByIndex](#getByIndex)
* [findByIndex](#findByIndex)
* [allSortByIndex](#allSortByIndex)
* [getTotal](#getTotal)
* [runWithLock](#runWithLock)

<a name="create"></a>
__create(value_object)__

Returns a factory instance model.

Create makes a new instance of the model with specific data.
Any fields in the `value_object` that were not defined get thrown out.
Validations are not done on creation, but some values may be processed based on the field definition type and `processIn` functions.

Create does not save the value; you'll have to run `.save(function (err) { ... })` on the returned model instance.

The model instance's private `.key` field will not be set until it has been saved either.

Logging the model out to console will produce a confusing result.
If you want the model's data, run `.toJSON()` and use the result.

Example:

```js
//assuming Person is a defined Model Factory
var person = Person.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});
person.save(function (err) {
    console.log("Person saved as:", person.key);
});
```

----

<a name="get"></a>
__get(key, options, callback)__

Get a specific model instance by key.

Arguments:

* key
* options
* callback: `function (err, model)`

Callback Arguments:

1. __err__: An error indicating failure to get the model instance.
2. __model__: A model instance of the Model Factory that called get (if there was no err).

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [depth](#op-depth)

Example:

```js
Person.get(someperson_key, {depth: 0}, function (err, person) {
    if (!err) {
        console.dir(person.toJSON());
    }
});
```

----

<a name="all"></a>
__all(options, callback)__

Get many/all of the model instances saved of this model factory
Results are in order of insertion unless ordered by an indexed field.

Arguments:

* options
* callback -- `function (err, models, pagination)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), [continuation](#op-continuation), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [sortBy](#op-sortBy)
* [index](#op-index)
* [indexValue](#op-indexValue)
* [indexRange](#op-indexRange)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)


:point\_up: Internally, [all](#all) is called by other methods that retrieve multiple results, doing some of the options for you. For example, [getByIndex](#getByIndex) calls all with [index](#op-index) and [indexValue](#op-indexValue).

Example:

```js
Person.all({limit: 10}, function (err, persons) {
    persons.forEach(function (person) {
        console.log(person.toJSON());
    });
});
```

----

<a name="update"></a>
__update(key, merge_object, options, callback)__

Updates an existing stored model with new data.
It only overrides fields that you send.

Arguments:

* key
* merge\_object
* options
* callback -- `function (err, newmodel)`

Callback Arguments:

1. __err__: Only set when there's been an error updating the model.
2. __newmodel__: The model instance after it's been updated.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [ctx](#op-ctx)

Example:

```js
Person.update(somekey, {lastName: 'Fritz'}, {bucket: 'peopleILike'}, function (err, person) {
    console.log(person.toJSON()); //lastName will be Fritz, other values unchanged
});
```

----

<a name="factory-delete"></a>
__delete(key, options, callback)__

Deletes a stored model.

Arguments:

* key
* options
* callback -- `function (err) {}`

Options:

* [db](#op-db)
* [bucket](#op-db)

----

<a name="wipe"></a>
__wipe(options, callback)__

Deletes all models and their children from the database.

Arguments:

* options
* callback -- `function (err)`

CallBack Arguments:

1. __err__: Only set if an error occured during wipe.

Options:

* [db](#op-db)
* [bucket](#op-db)

:heavy\_exclamation\_mark: No really, it deletes everything for that model!

-----

<a name="getByIndex"></a>
__getByIndex(field, value, options, callback)__

Gets the models by an index.

Arguments:

* field: indexed field
* value: value to match
* options
* callback -- `function (err, models, pagination)`

Callback Arguments:

1. __err__: Set only if there was an error.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), [continuation](#op-continuation), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)


:point\_up: This ends up calling [all](#all) with some index options, so you get the same pagination features.

```javascript
Person.getByIndex('lastName', 'Fritz', function (err, persons) {
    console.log("All of the Fritzes.");
    persons.forEach(function (person) {
        console.log(person.key, person.fullName);
    });
});
```

-----

<a name="findByIndex"></a>
__findByIndex(field, value, options, callback)__

Just like [getByIndex](#getByIndex), except only return one value, rather than an array of models, or an error.

Arguments:

* field: indexed field
* value: value to match
* options
* callback -- `function (err, model)`

Callback Arguments:

1. __err__: Set only if there was an error.
2. __model__: Model instance if an index of the specified value was found. Otherwise `undefined`.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [depth](#op-depth)

```javascript
Person.findByIndex('phoneNumber', '509-555-5555', function (err, person) {
    if (!err && person) {
        console.log("Found person", person.toJSON(), '@ key', person.key);
    } else {
        console.log("Unable to find person with that phone number.");
    }
});
```

<a name="allSortByIndex"></a>
__allSortByIndex(field, options, callback)__

Just like [all](#all) with the [sortBy](#op-sortBy) option.
Sorted results should be much faster than sorting after retrieval, as indexes are presorted in the db.

Arguments:

* field: indexed field to sort by
* options
* callback -- `function (err, model)`

Callback Arguments:

1. __err__: Set only if there was an error.
2. __model__: Model instance if an index of the specified value was found. Otherwise `undefined`.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)

```javascript
Person.allSortBy('phoneNumber', {reverse: true}, function (err, persons) {
    //persons sorted by phone # in reverse
});
```

----

<a name="getTotal"></a>
__getTotal(options, callback)__

Get the total count of all keys.

Arguments:

* options
* callback: `function (err, count)`

Callback Arguments:

1. __err__: Set only if there was an error.
2. __count__: A total count of all keys.

Options:

* [db](#op-db)
* [bucket](#op-bucket)

Example:

```js
Person.getTotal(function (err, count) {
    if (!err) {
        console.log(count);
    }
});
```

<a name="runWithLock"></a>
__runWithLock(callback)__

Node.js is not threaded, but it is asynchronous. This can make database access in keystores hazardous.
The issue requires you to understand some subleties about the event stack.
Anytime you're updating a value based on get(s), you should lock around these operations to prevent the operation from changing under you.

An incrementer is a good example.
You have to read the previous value, and update based on that.
But what if, when the process goes back to the event loop when you call save, an function runs that changes the value?
Now that value is lost.

Duclimer keeps an internal lock for writes that `runWithLock` that runWithLock acquires for you to solve problems like this.
runWithLock queus other locking calls until you `unlock()`

:heavy\_exclamation\_mark: Within a locked function, anytime you call [save](#save) or [delete](#delete) use the option `withoutLock` set to `true`. You need to do this because you already have a write lock. This is the **ONLY** time you should do so.

Arguments:

* callback: the function you want to run without any async steps undone before the next time

Callback Arguments:

* unlock: function to call when all of your async operations are done to release the lock

Example:

```javascript
function Increment(key, amount, cb) {
    SomeModelFactory.runWithLock(function (unlock) {
        SomeModelFactory.get(key, function (err, model) {
            model.count += amount;
            //note the withoutLock
            model.save({withoutLock: true}, function (err) {
                unlock(); //if you don't do this, this function will only be able to run once.. ever!
                cb(err, model.count);
            });
        });
    });
}
```
:heavy\_exclamation\_mark: Make sure that the end of all of your code flows end in an `unlock()` if you're using if statements!

## Model Instance Methods

* [save](#save)
* [delete](#delete)
* [addForeign](#addForeign)
* [removeForeign](#removeForeign)
* [getForeign](#getForeign)
* [getReverseForeign](#getReverseForeign)
* <del>[createChild](#createChild)</del>
* <del>[getChild](#getChild)</del>
* <del>[getChildren](#getChildren)</del>
* <del>[getChildrenByIndex](#getChildrenByIndex)</del>
* <del>[findChildByIndex](#findChildByIndex)</del>
* [toJSON](#toJSON)
* [toString](#toString)
* [diff](#diff)
* [getChanges](#getChanges)
* [getOldModel](#getOldModel)
* [loadData](#loadData)

<a name="save"></a>
__save(options, callback)__

Saves the current model instance to a serialized form in the db.

Fields may be omitted based on the model options [saveKey](#mo-saveKey) & [savePrivate](#mo-savePrivate), and field definition parameters of [private](#def-private) & [save](#def-save).

Any [foreignKey](#def-foreignKey) and [foreignCollection](#def-foreignCollection) fields will be collapsed back down to just their `key` fields.

Any [processOut](#def-processOut) functions will be ran to process the fields into their serialized form.

If the model doesn't already have a `key` field assigned, a new key will be generated.

Arguments:

* options
* callback: function (err)

Callback Arguments:

1. __err__: Only set if an error occured.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [ctx](#op-ctx)
* withoutLock: only set to true if you're running save within a runWithLock block.


:heavy\_exclamation\_mark: Foreign objects are not saved.

Example:

```javascript
var person = Person.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});

person.save(function (err) {
    console.log("Person:", person.fullName, "saved as", person.key);
    //fullName is a derived field
    //person.key got generated during save
    //didn't pass options because they're optional, remember?
});
```

----

<a name="instance-delete"></a>
__delete(options, callback)__

Deletes the instance from the database.

Arguments:

* options
* callback: `function (err)`

Callback Arguments:

1. __err__: Only set when an error has occured while deleting.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [ctx](#op-ctx)
* withoutLock: only set to true if you're running save within a runWithLock block.

Example:

```javascript
person.delete({ctx:{userid: someuser}}, function (err) {
    //the model option onDelete was called with the ctx object
});
```

---

<a name="addForeign"></a>
__addForeign(field, other, options, callback)__

Add a relationship to `this` model instance of another model instance or key.

Arguments:

* field: field in this model's definition with foreignKeys
* other: key or model instance of the model factory referred to as `field`'s foreignKeys
* options
* callback

Callback Arguments:

* err


Example:

```javascript
var BlogPostFactory = new dulcimer.Model({
    title: {type: 'string'},
    body: {type: 'string'},
    contributors: {foreignKeys: 'user'}
}, {name: 'blogpost'})

var User = new dulcimer.Model({
    //...
});

//...

var user = User.create({
    //...
});


var post = Post.create({
    title: "Some Blog Title",
    body: "It could happen to you..."
});


user.save(function (err) {
    post.save(function (err) {
        post.addForeign('contributors', user, function (err) {
            //...
        });
    });
});
``` 

---

<a name="removeForeign"></a>
__removeForeign(field, other, options, callback)__

Remove a relationship to `this` model instance of another model instance or key.

Arguments:

* field: field in this model's definition with foreignKeys
* other: key or model instance of the model factory referred to as `field`'s foreignKeys
* options
* callback

Callback Arguments:

* err

Example:

```javascript
BlogPostFactory.get('somekey', function (err, post) {
    post.removeForeign('contributors', 'someuserkeyOrInstance', function (err) {
        //...
    });
});
```

---

<a name="getForeign"></a>
__getForeign(field, options, callback)__

Retrieves the model instances from foreign relationships of the field.

Arguments:

* field: field with foreignKeys
* options
* callback `function (err, models, callback)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), [continuation](#op-continuation), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)

Example:

```javascript
blogPost.getForeign('contributors', {limit: 10}, function (err, users, page) {
    if (users.length > 0) {
        console.log(users[0].toJSON());
    }
});
```

----

<a name="getReverseForeign"></a>
__getReverseForeign(modelfactory, field, options, callback)__

Retrieves the model instances of another modelfactory with a foreignKeys field to `this`'s modelfactory.
Just like [getForeign](#getForeign) but from the reverse side.

Arguments:

* modelfactory: model from which the foreignKeys field exists
* field: field in the modelfactory with foreignKeys back to `this` model instance
* options
* callback `function (err, models, callback)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), [continuation](#op-continuation), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)

Example:

```javascript
user.getReverseForeign(BlogPostFactory, 'contributors', {limit: 10}, function (err, posts, page) 
    posts.forEach(function (post) {
        console.log(post.title);
    });
});
```

----

<a name="createChild"></a>
__createChild(ModelFactory, value)__

Children are model instances that you can attach to a model instance.
They're great for revision logs, comments, etc.

* ModelFactory: This can be any Dulcimer Model factory, including the same one as the parent.
* value: initial value, used just like [create](#create)

Example:

```javascript
var comment = person.createChild(Comment, {
    body: "I think that guy is pretty great.",
    author: otherperson,
});
comment.save(function (err) {
    console.log("Comment", comment.key, "added to", person.key);
});
```


:point\_up: [Comment.all](#all) will not include the children comments. Only this specific person instance can access these comments with [getChildren](#getChildren), [getChildrenByIndex](#getChildrenByIndex), and [findChildByIndex](#findChildByIndex).


:point\_up: Deleting the parent object will delete the children.

----

<a name="getChild"></a>
__getChild(ModelFactory, key, opts, callback)__

Just like the [get](#get) command, but called from a parent model instance for loading a child.

Arguments:

* key
* options
* callback

Callback Arguments:

1. __err__
2. __model_instance__

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [depth](#op-depth)

---


<a name="getChildren"></a>
__getChildren(ModelFactory, options, callback)__

Get the children of this model instance of a specific model factory.

Arguments:

* ModelFactory: This can be any Dulcimer Model factory, including the same one as the parent.
* options
* callback `function (err, models, callback)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), [continuation](#op-continuation), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* [offset](#op-offset)
* [limit](#op-limit)
* [sortBy](#op-sortBy)
* [index](#op-index)
* [indexValue](#op-indexValue)
* [indexRange](#op-indexRange)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)


:point\_up: Internally, this method calls [all](#all) with special internal use only options to work with specifically the children on this model instance.

Example:

```javascript
person.getChildren(Comment, function (err, comments, pagination) {
    console.log("All of the comments for", person.fullName);
    console.log("-===============================-", pagination.total);
    comments.forEach(function (err, comment) {
        console.log(comment.body);
        console.log("-", comment.author.fullName);
    });
});
```

----

<a name="getChildrenByIndex"></a>
__getChildrenByIndex(ModelFactory, field, value, options, callback)__

Retrieves the children of a specific instance, of a specific model, with a specific indexed field value.

Arguments:

* ModelFactory: This can be any Dulcimer.Model factory, including the same one as the parent.
* field: index field
* value: field value to match
* options
* callback `function (err, models, callback)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __models__: An array of model instances unless the [returnStream option](#op-returnStream) is true, at which point it is an [object stream](http://nodejs.org/api/stream.html#stream_object_mode) of resulting model instances.
3. __pagination__: An object containing specified [limit](#op-limit), [offset](#op-offset), [continuation](#op-continuation), an actual `count` and potential `total` if no offset/limit had been assigned.

Options:

* [db](#op-db)
* [bucket](#op-bucket)
* <del>[offset](#op-offset)</del>
* [continuation](#op-continuation)
* [limit](#op-limit)
* [reverse](#op-reverse)
* [filter](#op-filter)
* [depth](#op-depth)
* [returnStream](#op-returnStream)

Example:

```javascript
person.getChildrenByIndex(Comment, 'date', '2014-02-10', function (err, comments, pagination) {
    console.log("All of the comments for", person.fullName, "today.");
    console.log("-===============================-", pagination.total);
    comments.forEach(function (err, comment) {
        console.log(comment.body);
        console.log("-", comment.author.fullName);
    });
});
```

----

<a name="findChildByIndex"></a>

Similar to [getChildrenByIndex](#getChildrenByIndex) except that it only returns one result.

Arguments:

* ModelFactory: This can be any Dulcimer Model factory, including the same one as the parent.
* field: index field
* value: field value to match
* options
* callback `function (err, model, callback)`

Callback Arguments:

1. __err__: If err is set, there has been an error getting result.
2. __model__: A model instance.

Options:

* [db](#op-db)
* [bucket](#op-bucket)

Example:

```javascript
person.findChildByIndex(Version, 'created', person.created, function (err, version) {
    console.log("The version log entry for the initial creation of", person.fullName);
    console.log(version.toJSON());
    //ok, this one is a bit contrived
});
```

----

<a name="toJSON"></a>
__toJSON(flags)__

Outputs a JSON style object from the model.

Boolean Flags:

* noDepth: false by default. If true, does not recursively toJSON objects like [foreignKey](#def-foreignKey)s and [foreignCollection](#def-foreignCollection)s.
* withPrivate: false by default. If true, includes fields with [private](#def-private) set to true.

Example:

You want an example? Look at all of the other examples... most of them use [toJSON](#toJSON).


:point\_up: [toJSON](#toJSON) does not produce a string, but an object. See: [toString](#toString).

----

<a name="toString"></a>
__toString()__

Just like [toJSON](#toJSON), but produces a JSON string rather than an object.

----

<a name="diff"></a>
__diff(other)__

Arguments:

* other: model instance to compare this one to.

Result: object of each field with left, and right values.

```js
{
    firstName: {left: 'Nathan', right: 'Sam'},
    lastName: {left: 'Fritz', right: 'Fritz'},
}
```


----

<a name="getChanges"></a>
__getChanges()__

Get the changes since [get](#get) or [create](#create).

Result: object of each field with then, now, and changed boolean.

```js
{
    body: {then: "I dont liek cheese.", now: "I don't like cheese.", changed: true},
    updated: {then: '2014-02-10 11:11:11', now: '2014-02-10 12:12:12', changed: true},
    created: {then: '2014-02-10 11:11:11', now: '2014-02-10 11:11:11', changed: false},
}
```

----

<a name="getOldModel"></a>
__getOldModel()__

Get a new model instance of this instance with all of the changes since [get](#get) or [create](#create) reversed.

Result: Model instance.

----

<a name="loadData"></a>
__loadData()__

Loads data just like when a model instance is retrieved or [create](#create)d.

[processIn](#def-processIn) is called on any fields specified, but [onSet](#def-onSet) is not.

Essentially the same things happen as when running [create](#create) but can be done after the model instance is initialized.

Example:

```javascript
var person = Person.create({
    firstName: 'Nathan',
    lastName: 'Fritz',
});

person.favoriteColor = 'blue';

person.loadData({
    favoriteColor: 'green',
    favoriteFood: 'burrito',
});

console.log(person.toJSON());
// {firstName: 'Nathan', lastName: 'Fritz', favoriteFood: 'burrito', favoriteColor: 'green'}
et!  All acronyms are already a mystery to me!``

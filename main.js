"use strict"

const MSCP = require("mscp")
const mysql = require("mysql")
const path = require("path")
const fs = require("fs");
const SearchQueryParser = require("searchqueryparser")
const Query2SQL = require("./query2sql.js")

class Handler{

  /* --------------------------------
              Basic
  -------------------------------- */
  async initFirst(){
    this.global.queryParser = new SearchQueryParser()
    await this.global.queryParser.init()
    this.initTables()
  }

  async query(query, ...args){
    return new Promise((resolve, reject) => {
      let conn = this.getConnection()
      if(!conn){
        console.log("Could not run query, as there aren't any active connection. Fix and restart.")
        return;
      }
      conn.query.apply(conn, [query, args, (err, data) => {
        if(err){
          console.log(query)
          console.log(args)
          console.log(err)
          reject(err)
        } else {
          resolve(data)
        }
      }])
    })
  }

  getConnection(){
    if(this.global.dbPool === undefined){
      this.dbOptions = this.mscp.setupHandler.setup.database
      if(typeof this.dbOptions === "object"){
        this.dbOptions.connectionLimit = 10
        this.dbOptions.multipleStatements = true
        //this.dbOptions.debug = true
        this.global.dbPool = mysql.createPool(this.dbOptions)
      } else {
        console.log("ERROR: Missing db options")
      }
    }
    return this.global.dbPool
  }

  async initTables(){
    await this.query("CREATE TABLE IF NOT EXISTS metadata_properties(entity varchar(80) NOT NULL, property varchar(100) NOT NULL, value nvarchar(1000) NOT NULL, PRIMARY KEY(entity, property))")
    await this.query("CREATE TABLE IF NOT EXISTS metadata_tags(entity varchar(80) NOT NULL, tag varchar(100) NOT NULL, PRIMARY KEY(entity, tag))")
    await this.query("CREATE TABLE IF NOT EXISTS metadata_relations(entity varchar(80) NOT NULL, entity2 varchar(80) NOT NULL, rel varchar(100) NOT NULL, PRIMARY KEY(entity, entity2, rel))")
  }


  /* --------------------------------
                Tags
  -------------------------------- */
  async addTag(id, tag){
    await this.query("INSERT IGNORE INTO metadata_tags(entity, tag) VALUES(?)", [id, tag])
    return this.getTags(id)
  }

  async removeTag(id, tag){
    await this.query("DELETE FROM metadata_tags WHERE entity = ? AND tag = ?", id, tag)
    return this.getTags(id)
  }

  async getTags(id){
    return (await this.query("SELECT tag FROM metadata_tags WHERE entity = ?", id)).map(function(row) {
      return row['tag'];
    });
  }

  async listTags(prefix){
    if(prefix != null){
      return (await this.query("SELECT tag FROM metadata_tags WHERE tag LIKE ? GROUP BY tag", prefix + "%")).map(function(row) {
        return row['tag'];
      });
    } else {
      return (await this.query("SELECT tag FROM metadata_tags GROUP BY tag")).map(function(row) {
        return row['tag'];
      });
    }
  }

  async getAllByTag(tag){
    return (await this.query("SELECT entity FROM metadata_tags WHERE tag = ?", tag)).map(function(row) {
      return row['entity'];
    });
  }

  async getAllByTags(tags){
    return (await this.query("SELECT entity FROM (SELECT entity FROM metadata_tags GROUP BY entity) AS e WHERE (SELECT count(entity) FROM metadata_tags WHERE entity = e.entity AND tag IN (?)) = ?", tags, tags.length)).map(function(row) {
      return row['entity'];
    });
  }


  /* --------------------------------
              Properties
  -------------------------------- */
  async getProperties(id){
    let rows = await this.query("SELECT property, value FROM metadata_properties WHERE entity = ?", id)
    var result = {}
    for (let i = 0; i < rows.length; i++) {
      result[rows[i].property] = rows[i].value
    }
    return result
  }

  async setProperty(id, prop, value){
    let property = {}
    property[prop] = value;
    return await this.setProperties(id, property)
  }

  async setProperties(id, properties){
    let query = ""
    let args = []
    for(let prop in properties){
      if(properties[prop] == null || properties[prop] == ""){
        query += "DELETE FROM metadata_properties WHERE entity = ? AND property = ?;"
        args.push(id)
        args.push(prop)
      }
      else {
        query += "INSERT INTO metadata_properties(entity, property, value) VALUES(?) on duplicate key update value = ?;"
        args.push([id, prop, properties[prop]], properties[prop])
      }
    }
    args.unshift(query)
    await this.query.apply(this, args)
    return this.getProperties(id)
  }


  /* --------------------------------
              Relations
  -------------------------------- */
  async getRelations(id){
    return (await this.query("SELECT entity2, rel FROM metadata_relations WHERE entity = ?", id)).map(function(row) {
      return {rel: row['rel'], id: row['entity2']};
    });
  }

  async addRelation(id, id2, rel, bothWays){
    await this.query("INSERT IGNORE INTO metadata_relations(entity, entity2, rel) VALUES(?)", [id, id2, rel])
    if(bothWays === true)
      await this.query("INSERT IGNORE INTO metadata_relations(entity, entity2, rel) VALUES(?)", [id2, id, rel])
    return null
  }

  async removeRelation(id, id2, rel, bothWays){
    if(bothWays === true)
      await this.query("DELETE FROM metadata_relations WHERE (entity = ? AND entity2 = ? AND rel = ?) OR (entity = ? AND entity2 = ? AND rel = ?)", id2, id, rel)
    else
      await this.query("DELETE FROM metadata_relations WHERE entity = ? AND entity2 = ? AND rel = ?", id, id2, rel)
    return null
  }


  /* --------------------------------
              Query
  -------------------------------- */
  async find(query, fillMetadata){
    let q = {}
    try{
      q = this.global.queryParser.parse(query)
    } catch(err){
      console.log(query)
      console.log(err)
      return []
    }

    let sql = new Query2SQL().generate(q)
    let result = (await this.query(sql)).map((row) => row['entity'])

    if(fillMetadata)
      result = await this.fillMetadataMultiple(result)

    return result;
  }

  async findMulti(queries, fillMetadata){
    let queriesParsed = []

    for(let q of queries){
      try{
        queriesParsed.push(this.global.queryParser.parse(q))
      } catch(err){
        console.log(query)
        console.log(err)
        return []
      }
    }

    let sql = new Query2SQL().generate(queriesParsed)
    let result = (await this.query(sql)).map((row) => row['entity'])

    if(fillMetadata)
      result = await this.fillMetadataMultiple(result)

    return result;
  }

  /* --------------------------------
                Misc
  -------------------------------- */
  async fillMetadata(id){
    let result = {id:id}
    result.tags = await this.getTags(id)
    result.properties = await this.getProperties(id)
    result.relations = await this.getRelations(id)
    return result
  }

  async fillMetadataMultiple(idList){
    let result = []
    let promises = []
    for(let id of idList){
      promises.push(this.fillMetadata(id))
    }
    for(let p of promises){
      result.push(await p)
    }
    return result;
  }
}

(async () => {
  let mscp = new MSCP(Handler)
  await mscp.start()
})()

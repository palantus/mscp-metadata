"use strict"

const mysql = require("mysql");

class Query2Sql{

  generate(q){
    let conditions = '';

    let queries = Array.isArray(q) ? q : [q];

    for(let i = 0; i < queries.length; i++){
      conditions += `${i>0?" AND " : ""} (${this.genConditionSQLQuery(queries[i])})`
    }

    if(!conditions)
      conditions = "1=2";

    let query = `SELECT entity FROM (
                    SELECT entity FROM metadata_tags GROUP BY entity
                    UNION
                    SELECT entity FROM metadata_relations GROUP BY entity
                    UNION
                    SELECT entity FROM metadata_properties GROUP BY entity
                  ) AS E
                  WHERE ${conditions} ORDER BY entity`

    return query;
  }

  genConditionSQLQuery(query){
    return this.handleExp(query);
  }

  handleExp(e){
    switch(e.type){
      case "and":
        return this.handleExp(e.e1) + " AND " + this.handleExp(e.e2)
      case "or":
        return this.handleExp(e.e1) + " OR " + this.handleExp(e.e2)
      case "token":
        return this.handleToken(e.token, e.tag)
      case "par":
        return "(" + this.handleExp(e.e) + ")"
      default:
        return "1=0"
    }
  }

    /* TODO:
      - Understøtter:
        * prop:prop=val
        * tag:tag
        * id:id
        * *

      - Skal understøtte:
        * prop:prop<val
        * rel:id=type                 (type optional)
        * reltype:type
        * relprop:reltype:prop:val    (property of related entity is "val")
        * reltag:reltype:tag          (related entity has tag)
    */

  handleToken(token, tag){
    if(token === undefined)
      return "1=1"

    switch(tag){
      case "tag":
        return `EXISTS(SELECT entity FROM metadata_tags where entity = E.entity AND tag = ${mysql.escape(token)})`

      case "prop":
        if(token.indexOf("=") >= 0){
          let prop = mysql.escape(token.split('=')[0])
          let val = mysql.escape(token.split('=')[1])
          return `EXISTS(SELECT entity FROM metadata_properties where entity = E.entity AND property = ${prop} AND value = ${val})`
        }
        break;

      case "rel":
        if(token.indexOf("=") >= 0){
          let entity2 = mysql.escape(token.split('=')[0])
          let rel = mysql.escape(token.split('=')[1])
          return `EXISTS(SELECT entity FROM metadata_relations where entity = E.entity AND entity2 = ${entity2} AND rel = ${rel})`
        }
        break;

      case "id":
        return `E.entity = ${mysql.escape(token)}`

      case undefined:
        if(token == "*"){
          return `1=1`
        }
    }

    return "1=0"
  }
}

module.exports = Query2Sql

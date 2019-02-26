# Tagging service for mscp

It requires a Mysql (or MariaDB) database.

Sample setup.json (mysql/mariadb):
```
{
    "http_port": 9005,
    "database": {
      "driver"   : "mysql",
      "host"     : "192.168.0.55",
      "user"     : "username",
      "password" : "password",
      "database" : "mydb"
    }
}
```

Sample setup.json (sqlite):
```
{
    "http_port": 9005,
    "database": {
      "driver"   : "sqlite",
      "file"     : "metadata.db"
    }
}
```

For usage, please check definition.json.

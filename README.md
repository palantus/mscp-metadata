# Tagging service for mscp

It requires a Mysql (or MariaDB) database.

Sample setup.json:
```
{
    "http_port": 9005,
    "database": {
      "host"     : "192.168.0.55",
      "user"     : "username",
      "password" : "password",
      "database" : "mydb"
    }
}
```

For usage, please check definition.json.

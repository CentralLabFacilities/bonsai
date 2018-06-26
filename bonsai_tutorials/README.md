# Bonsai Tutorial

This project shows a simple bonsai distribution

## Prereq

## Rosjava msgs

You can fetch the required rosjava msgs by adding these repositories to your .m2/settings.xml

```xml
  <repository>
    <id>citec</id>
    <name>citec</name>
    <url>https://mvn.cit-ec.de/nexus/content/repositories/releases</url>
    <layout>default</layout>
    <releases>
        <updatePolicy>always</updatePolicy>
        <enabled>true</enabled>
    </releases>
  </repository>

  <repository>
    <id>citec</id>
    <name>citec</name>
    <url>https://mvn.cit-ec.de/nexus/content/repositories/snapshots</url>
    <layout>default</layout>
    <releases>
        <enabled>false</enabled>
    </releases>
     <snapshots>
        <enabled>true</enabled>
        <updatePolicy>always</updatePolicy>
      </snapshots>
  </repository>
```

## Run from within IDE

Bonsai needs the path to resolve scxml files . For this you have to create a Mappings file.

```
cp bonsai_tutorials/src/main/resources/localMapping.default.properties bonsai_tutorials/src/main/resources/localMapping.properties

sed -i 's@<PATH_TO>@'"$PWD"'@g' bonsai_tutorials/src/main/resources/localMapping.properties
```

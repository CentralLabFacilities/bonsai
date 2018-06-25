==========
Quickstart
==========

General
=======

Maven
-----

To fetch the dependencies of bonsai add the following repositories to your ``.m2/settings.xml``

Repositories:

.. code-block:: xml

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

Bonsai
-------

1. Create a directory for bonsai stuff and change into the dir::

    mkdir bonsai
    cd bonsai

2. Checkout bonsai::

    git clone https://github.com/LeroyR/bonsai-test-repo.git
    git clone clf bonsai extensions

3. and additional statemachines::

    git clone http://projects.cit-ec.uni-bielefeld.de/git/pepper.bonsai.git
    git clone http://projects.cit-ec.uni-bielefeld.de/git/robocupathome.robocup-dist.git

.. note: Robocup@Bielefeld only repositories

3. Copy example-dist and patch the path::

    cp -r bonsai/bonsai_tutorials my_dist
    cp my_dist/src/main/resources/localMapping.default.properties my_dist/src/main/resources/localMapping.properties
    sed -i 's@<PATH_TO>@'"$PWD"'@g' my_dist/src/main/resources/localMapping.properties

4. Assemble run script::

    cd my_dist
    mvn -B install appassembler:assemble

5. Start a roscore in another terminal

6. Run example statemachine::

    target/appassembler/bin/bonsai  -c src/main/config/bonsai_configs/minimalConfig.xml -t src/main/config/state_machines/minimal.xml


Pepper IDEA
===========

1. Setup Jenkins
2. Install IntelliJ IDEA
3. create a directory for bonsai stuff and change into the dir::

    mkdir bonsai
    cd bonsai

4. Run the following commands::

    git clone http://projects.cit-ec.uni-bielefeld.de/git/bonsai-2.git
    git clone http://projects.cit-ec.uni-bielefeld.de/git/pepper.bonsai.git
    git clone http://projects.cit-ec.uni-bielefeld.de/git/robocupathome.robocup-dist.git
    cp pepper.bonsai/pepper-bin/src/main/resources/localMapping.default.properties pepper.bonsai/pepper-bin/src/main/resources/localMapping.properties
    sed -i 's@<PATH_TO>@'"$PWD"'@g' pepper.bonsai/pepper-bin/src/main/resources/localMapping.properties
    cd pepper.bonsai
    cp -R idea-default idea
    idea idea

5. Idea should now start with every bonsai module loaded. Delete the modules you are not working on (FILE->Project Structure / Modules)


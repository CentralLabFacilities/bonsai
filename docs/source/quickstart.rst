==========
Quickstart
==========

General
=======

.. _maven:

Maven
-----

To fetch the dependencies of bonsai add the following repositories to your ``.m2/settings.xml``

Repositories:

.. code-block:: xml

    ...
    <profiles>
        <profile>
            ...
            <repositories>

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
                    <id>citec-snapshots</id>
                    <name>citec-snapshots</name>
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

            </repositories>
            ...
        </profile>
    </profiles>
    ...

Quickstart
----------

0. add repositories to settings.xml, see :ref:`maven`.

1. Create a directory for bonsai and change into the dir::

    mkdir bonsai
    cd bonsai

2. Checkout bonsai and addons::

    git clone https://github.com/CentralLabFacilities/bonsai.git

.. note::

    Robocup at Bielefeld only repositories::

        git clone https://github.com/CentralLabFacilities/bonsai_addons.git
        git clone http://projects.cit-ec.uni-bielefeld.de/git/pepper.bonsai.git
        git clone http://projects.cit-ec.uni-bielefeld.de/git/robocupathome.robocup-dist.git

3. Copy tutorials and patch the path::

    cp -r bonsai/bonsai_tutorials my_dist
    cp my_dist/src/main/resources/localMapping.default.properties my_dist/src/main/resources/localMapping.properties
    sed -i 's@<PATH_TO>@'"$PWD"'@g' my_dist/src/main/resources/localMapping.properties

4. Assemble run script::

    cd my_dist
    mvn -B install appassembler:assemble

5. Start a roscore in another terminal

6. Run example statemachine::

    target/appassembler/bin/bonsai -c src/main/config/bonsai_configs/minimalConfig.xml -t src/main/config/state_machines/minimal.xml

Building all projects
=====================

1. create and initialize a catkin workspace::

    mkdir ws_bonsai
    cd ws_bonsai
    source /opt/ros/kinetic.bash
    catkin init

.. note::

    You may want to source a different workspace

    Robocup at Bielefeld::

        source /vol/robocup/<DIST>/setup.bash

2. link bonsai projects::

    mkdir src
    cd src
    ln -s <PATH to bonsai.git>
    ln -s <link to addons, pepper-dist etc>
    cd ..

3. build workspace::

    catkin build

4. run bonsai tutorials dist::

    source devel/setup.bash
    roslaunch bonsai_tutorials bonsai.launch


Robocup at Bielefeld
====================

Pepper
------

0. Setup Jenkins
1. Install IntelliJ IDEA
2. Run the following commands::

    mkdir bonsai
    cd bonsai
    git clone https://github.com/CentralLabFacilities/bonsai.git
    git clone https://github.com/CentralLabFacilities/bonsai_addons.git
    git clone http://projects.cit-ec.uni-bielefeld.de/git/pepper.bonsai.git
    git clone http://projects.cit-ec.uni-bielefeld.de/git/robocupathome.robocup-dist.git
    cp pepper.bonsai/pepper-bin/src/main/resources/localMapping.default.properties pepper.bonsai/pepper-bin/src/main/resources/localMapping.properties
    sed -i 's@<PATH_TO>@'"$PWD"'@g' pepper.bonsai/pepper-bin/src/main/resources/localMapping.properties
    cd pepper.bonsai
    cp -R idea-default idea
    idea idea

3. Idea should now start with every bonsai module loaded. Delete the modules you are not working on (FILE->Project Structure / Modules)


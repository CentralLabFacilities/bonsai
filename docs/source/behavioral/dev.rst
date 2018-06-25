==========================
Behavior Abstraction Layer
==========================

.. highlight:: yaml

BehaviorAL is used to expose robot behaviors to extern users (e.x Apartment)
It can be used to trigger statemachines remotely.

Params:

.. code-block:: java

	@Option(name = "-l", aliases = {"--logging"}, metaVar = "PATH", usage = "path to a log4j properties file")
	@Option(name = "-c", aliases = {"--config"}, metaVar = "PATH", usage = "path to the bahaviorAL config file")
	@Option(name = "-s", aliases = {"--server_scope"}, metaVar = "VALUE", usage = "scope for server, default is: '/bonsai'")
	@Option(name = "-b", aliases = {"--bonsai_server"}, metaVar = "VALUE", usage = "scope for bonsai (the server that gets the xml files), default is: '/behavioral/server'")


Example config file::

	autoload: example
	statemachines:
		- name: example
			task: ${PATH_TO_CSRA_SCXML}/example.xml
			config: ${PATH_TO_CSRA_CONFIG}/csra/CSRAMekaConfig.xml
			actions:
				- name: talk
					target: ExecuteSpeak
					params:
						text: "hello"
				- name: gotoannotation
					target: ExecuteNavToAnnotation
					params:
						location: "start"
				- name: stop
					target: ExecuteStop
				- name: test
					target: MemoryTest
		- name: test
			task: ${PATH_TO_CSRA_SCXML}/test2.xml
			config: ${PATH_TO_CSRA_CONFIG}/csra/CSRATest.xml
			actions:
				- name: start
					target: init
					params:
						object: blaanything


This configuration will automatically load the ``example`` statemachine. As the loading takes some time to verify config etc. you can configure the multiple initial states that can be triggered (``actions``). Each behavior should end with a final state to indicate when the ``action`` is finished. A final ``End`` state indicates that the ``action`` finished without errors.

- ``target`` sets the scxml initial state
- ``name`` is used to call the action
- ``params``  can be used to overwrite statemachine variables:

Example dialog.Talk skill (from ExecuteSpeak):

.. code-block:: xml

	 <data id="#_MESSAGE" expr="'@text'" />

RSB Interface
-------------

RPCserver runs on (default) /behavioral/server 

- ``String listScenarios()``
	- returns a ";" seperated string containing all scenarios

- ``boolean changeScenario(String)``
	- changes the currently loaded scenario

- ``String listActions()``
	- returns a ";" seperated string containing all actions of the currently loaded scenario

- ``dict getActionParams(String)``
	- returns a dict that can contains all params used by the action
		- the dict can be used to call ``startAction()``

- ``boolean startAction(X)``
	- starts the statemachine a predifined action
	- x=String start action x
		- can be used to set statemachine parameter with String like ``name=speakTobi,text="hello",variable=x``
	- x=Dict start action by dict

- ``boolean isDone()``
	- blocking callback until statemachine stops running
	- returns true if last state was ``End``

## Current

### BTL 

* Types
* Middleware Adapter

##### BTL-Base
##### BTL-MW (ros,rsb,xml)

### Bonsai Core 

* Aktuator Sensor IF
* Middleware Adapter
* Core (configure)

##### Bonsai Base
##### Bonsai MW (ros,rsb)

### Bonsai Beh

* Statemachine Core
* Skills
* FXGUI
* GUI Interfaces 
* GUI If impl (rsb)
* Bonsai Server
* Behavioral Server


### Robocupathome

* extender
* skills
* scxmls
* config

### Bonsai Meka

* extender
* skills
* scxmls
* config
* behaviors
* AS IF, impl

## Proposal

### Bonsai-Core

* Type Memory (!NEW)
* Core (configure)
* Core Statemachine
* GUI Interfaces
* FXGUI
* Bonsai Cli (!NEW)
* Bonsai+Behavior Cli (!NEW)
* FXGUI+bonsai+behavior bundle (no MW) (!NEW)

### Bonsai-Interface

* Types (BTL)
* Aktuator Sensor  

### Bonsai-Skills

* Skills
* behaviors ?
* statemachines ?

### Bonsai-Adapter (#MW)

* Middleware Adapter T/AS

### bonsai-dist

* configs ?
* inclue bonsai-adapter-rsb (bsp)


# Bonsai

## Problems

* hard to "grasp"
* hard middleware dependencies to build projects

## Rewrite

* to proposal

### Questions

* repository layouts, monorepo? skills+ifs? single?
* extension projects? (skills+beh+T/A/S+impl)
	* faster dev on non monorepo
	* skip/shorten design implement whatever

### Main TODOS

* Refactor current layout to proposal
* implement cli/noMW gui
* Base Cleanup 
	* btl remove types covered by tf, ()
	* improve btl/core interface (transform type, translate type) (prop: translate.mw.to/fromMw<T,W>)
		* better errors
	* aktuator/sensor: rsbxxx -> tobixxx and rsbGraspAct -> katanaGraspAct etc

* improve java ros usage (wait time -> concurrent node start wait at end)

* Skills
	* improve config phase *shrug*

* Core
	* split scxml verification (slots,transitions) and config verify

* SCXML
	* move slot def to skills
	* replace with custom yaml? format -> or different sm

* build gui?
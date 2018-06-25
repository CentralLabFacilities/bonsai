cmake_minimum_required(VERSION 2.8.3)
project(bonsai_msgs)

find_package(catkin REQUIRED 
	COMPONENTS 
		message_generation
)

add_message_files(
	FILES
		Map.msg
		StateList.msg
		Transition.msg
)

add_service_files(
	FILES
		FireEvent.srv
		LoadStatemachine.srv
		PauseStatemachine.srv
		SetParams.srv
		StartStatemachine.srv
		DisableAutomaticTransitions.srv
		GetCurrentStatus.srv
)

generate_messages(
)

catkin_package(
	CATKIN_DEPENDS 
		message_runtime 
)

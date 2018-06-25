cmake_minimum_required(VERSION 2.8.3)
project(bonsai_core)

find_package(catkin REQUIRED rosjava_build_tools)

# catkin_rosjava_env_setup()

catkin_package()

add_custom_target(bonsai_core ALL 
				  COMMAND mvn -Ddir=${CMAKE_BINARY_DIR} -DoutputDirectory=${CATKIN_PACKAGE_BIN_DESTINATION} -DaltDeploymentRepository=ros::default::file://${CMAKE_INSTALL_PREFIX}/${CATKIN_GLOBAL_MAVEN_DESTINATION} -B deploy
				  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
				  )

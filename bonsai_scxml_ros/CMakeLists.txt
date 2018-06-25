cmake_minimum_required(VERSION 2.8.3)
project(bonsai_scxml_ros)

find_package(catkin REQUIRED rosjava_build_tools bonsai_core)

# catkin_rosjava_env_setup()

catkin_package()

add_custom_target(bonsai_scxml_ros ALL 
				  COMMAND mvn -Ddir=${CMAKE_BINARY_DIR} -DoutputDirectory=${CATKIN_PACKAGE_BIN_DESTINATION} -DassembleDirectory=${CMAKE_INSTALL_PREFIX}/${CATKIN_PACKAGE_SHARE_DESTINATION} -DaltDeploymentRepository=ros::default::file://${CMAKE_INSTALL_PREFIX}/${CATKIN_GLOBAL_MAVEN_DESTINATION} -B deploy appassembler:assemble
				  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
				  )

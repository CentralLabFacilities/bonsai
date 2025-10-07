cmake_minimum_required(VERSION 2.8.3)
project(bonsai_skills)

find_package(catkin REQUIRED rosjava_build_tools)

# catkin_rosjava_env_setup()

catkin_package()

set(REPOSITORY_DIR ${CATKIN_DEVEL_PREFIX}/${CATKIN_GLOBAL_MAVEN_DESTINATION})

add_custom_target(maven ALL 
				  COMMAND mvn -X -Ddir=${CMAKE_BINARY_DIR} -DoutputDirectory=${CATKIN_PACKAGE_BIN_DESTINATION} -DaltDeploymentRepository=ros::default::file://${REPOSITORY_DIR} -DskipTests=true -B deploy install
				  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
				  )

#########
# INSTALL
#########

#install repository
install(DIRECTORY ${REPOSITORY_DIR}/
	DESTINATION ${CMAKE_INSTALL_PREFIX}/${CATKIN_GLOBAL_MAVEN_DESTINATION}
)

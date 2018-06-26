cmake_minimum_required(VERSION 2.8.3)
project(bonsai_scxml_engine)

find_package(catkin REQUIRED rosjava_build_tools bonsai_core)

# catkin_rosjava_env_setup()

catkin_package()

set(ASSEMBLE_DIR ${CATKIN_DEVEL_PREFIX}/${CATKIN_PACKAGE_SHARE_DESTINATION})
set(REPOSITORY_DIR ${CATKIN_DEVEL_PREFIX}/${CATKIN_GLOBAL_MAVEN_DESTINATION})

add_custom_target(maven ALL 
				  COMMAND mvn -Ddir=${CMAKE_BINARY_DIR} -DoutputDirectory=${CATKIN_PACKAGE_BIN_DESTINATION} -DassembleDirectory=${ASSEMBLE_DIR} -DaltDeploymentRepository=ros::default::file://${REPOSITORY_DIR} -B deploy appassembler:assemble
				  WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
				  )

#########
# INSTALL
#########

#install repository
install(DIRECTORY ${REPOSITORY_DIR}
	DESTINATION ${CMAKE_INSTALL_PREFIX}/${CATKIN_GLOBAL_MAVEN_DESTINATION}
)

#install appassembler
install(DIRECTORY ${ASSEMBLE_DIR}/bin ${ASSEMBLE_DIR}/etc ${ASSEMBLE_DIR}/lib 
	DESTINATION ${CATKIN_PACKAGE_SHARE_DESTINATION}
	PATTERN "bin/*"
	PERMISSIONS OWNER_EXECUTE OWNER_WRITE OWNER_READ GROUP_EXECUTE GROUP_READ WORLD_EXECUTE WORLD_READ
)
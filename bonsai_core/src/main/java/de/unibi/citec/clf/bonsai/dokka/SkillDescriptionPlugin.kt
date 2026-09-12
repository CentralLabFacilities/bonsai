package de.unibi.citec.clf.bonsai.dokka

import com.google.auto.service.AutoService
import org.jetbrains.dokka.CoreExtensions
import org.jetbrains.dokka.model.DClasslike
import org.jetbrains.dokka.model.DModule
import org.jetbrains.dokka.model.doc.DocTag
import org.jetbrains.dokka.model.doc.Text
import org.jetbrains.dokka.plugability.DokkaContext
import org.jetbrains.dokka.plugability.DokkaPlugin
import org.jetbrains.dokka.plugability.DokkaPluginApiPreview
import org.jetbrains.dokka.plugability.PluginApiPreviewAcknowledgement
import org.jetbrains.dokka.transformers.documentation.DocumentableTransformer
import org.jetbrains.dokka.model.doc.Description

import java.nio.file.Files
import java.util.Properties

@AutoService(DokkaPlugin::class)
class SkillDescriptionPlugin : DokkaPlugin() {

    @OptIn(DokkaPluginApiPreview::class)
    override fun pluginApiPreviewAcknowledgement() =
        PluginApiPreviewAcknowledgement

    val skillDescriptionTransformer by extending {
        CoreExtensions.documentableTransformer with
                SkillDescriptionTransformer()
    }
}

class SkillDescriptionTransformer : DocumentableTransformer {

    override fun invoke(
        original: DModule,
        context: DokkaContext
    ): DModule {

        val output = context.configuration.outputDir
            .toPath()
            .parent
            .resolve(
                "classes/META-INF/bonsai/skill-descriptions.properties"
            )

        Files.createDirectories(output.parent)

        val properties = Properties()

        original.packages
            .flatMap { it.classlikes }
            .forEach { classlike ->
                addClassDescription(
                    classlike,
                    properties
                )
            }

        Files.newBufferedWriter(output).use {
            properties.store(it, null)
        }

        return original
    }

    private fun addClassDescription(
        classlike: DClasslike,
        properties: Properties
    ) {
        val packageName =
            classlike.dri.packageName.orEmpty()

        val className =
            classlike.dri.classNames.orEmpty()

        if (className.isNotBlank()) {
            val fullName =
                if (packageName.isBlank()) {
                    className
                } else {
                    "$packageName.$className"
                }

            val description =
                classlike.documentation.values
                    .firstOrNull()
                    ?.children
                    ?.filterIsInstance<Description>()
                    ?.flatMap { it.root.children }
                    ?.joinToString("") {
                        extractText(it)
                    }
                    ?.trim()
                    .orEmpty()

            if (description.isNotBlank()) {
                properties.setProperty(
                    fullName,
                    description
                )
            }
        }

        classlike.classlikes.forEach {
            addClassDescription(it, properties)
        }
    }

    private fun extractText(tag: DocTag): String {
        return when (tag) {
            is Text -> tag.body

            else -> tag.children.joinToString("") {
                extractText(it)
            }
        }
    }
}
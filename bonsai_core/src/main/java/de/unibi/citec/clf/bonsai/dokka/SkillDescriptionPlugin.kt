package de.unibi.citec.clf.bonsai.dokka

import com.google.auto.service.AutoService
import org.jetbrains.dokka.CoreExtensions
import org.jetbrains.dokka.model.DClasslike
import org.jetbrains.dokka.model.DModule
import org.jetbrains.dokka.model.doc.Description
import org.jetbrains.dokka.model.doc.DocTag
import org.jetbrains.dokka.model.doc.Text
import org.jetbrains.dokka.plugability.DokkaContext
import org.jetbrains.dokka.plugability.DokkaPlugin
import org.jetbrains.dokka.plugability.DokkaPluginApiPreview
import org.jetbrains.dokka.plugability.PluginApiPreviewAcknowledgement
import org.jetbrains.dokka.transformers.documentation.DocumentableTransformer
import org.objectweb.asm.AnnotationVisitor
import org.objectweb.asm.ClassReader
import org.objectweb.asm.ClassVisitor
import org.objectweb.asm.ClassWriter
import org.objectweb.asm.Opcodes
import java.nio.file.Files
import java.nio.file.Path

@AutoService(DokkaPlugin::class)
class SkillDescriptionPlugin : DokkaPlugin() {

    @OptIn(DokkaPluginApiPreview::class)
    override fun pluginApiPreviewAcknowledgement() =
        PluginApiPreviewAcknowledgement

    val skillDescriptionTransformer by extending {
        CoreExtensions.documentableTransformer with SkillDescriptionTransformer()
    }
}

class SkillDescriptionTransformer : DocumentableTransformer {

    companion object {
        private const val SKILL_DOCUMENTATION_DESCRIPTOR =
            "Lde/unibi/citec/clf/bonsai/engine/model/SkillDocumentation;"
    }

    override fun invoke(
        original: DModule,
        context: DokkaContext
    ): DModule {
        val classesDir = context.configuration.outputDir
            .toPath()
            .parent
            .resolve("classes")

        original.packages
            .flatMap { it.classlikes }
            .forEach { classlike ->
                processClasslike(classlike, classesDir)
            }

        return original
    }

    private fun processClasslike(
        classlike: DClasslike,
        classesDir: Path
    ) {
        val packageName = classlike.dri.packageName.orEmpty()
        val classNames = classlike.dri.classNames.orEmpty()

        if (classNames.isNotBlank()) {
            val description = classlike.documentation.values
                .firstOrNull()
                ?.children
                ?.filterIsInstance<Description>()
                ?.flatMap { it.root.children }
                ?.joinToString("") { extractText(it) }
                ?.trim()
                .orEmpty()

            if (description.isNotBlank()) {
                val classFile = resolveClassFile(
                    classesDir,
                    packageName,
                    classNames
                )

                if (Files.exists(classFile)) {
                    writeDocumentationAnnotation(
                        classFile,
                        description
                    )
                }
            }
        }

        classlike.classlikes.forEach {
            processClasslike(it, classesDir)
        }
    }

    private fun resolveClassFile(
        classesDir: Path,
        packageName: String,
        classNames: String
    ): Path {
        val packagePath =
            if (packageName.isBlank()) {
                classesDir
            } else {
                classesDir.resolve(packageName.replace('.', '/'))
            }

        val jvmClassName = classNames.replace('.', '$')

        return packagePath.resolve("$jvmClassName.class")
    }

    private fun writeDocumentationAnnotation(
        classFile: Path,
        description: String
    ) {
        val reader = ClassReader(Files.readAllBytes(classFile))
        val writer = ClassWriter(reader, 0)

        val visitor = object : ClassVisitor(
            Opcodes.ASM9,
            writer
        ) {
            override fun visitAnnotation(
                descriptor: String,
                visible: Boolean
            ): AnnotationVisitor? {
                if (descriptor == SKILL_DOCUMENTATION_DESCRIPTOR) {
                    return null
                }

                return super.visitAnnotation(
                    descriptor,
                    visible
                )
            }

            override fun visitEnd() {
                val annotation = super.visitAnnotation(
                    SKILL_DOCUMENTATION_DESCRIPTOR,
                    true
                )

                annotation.visit("value", description)
                annotation.visitEnd()

                super.visitEnd()
            }
        }

        reader.accept(visitor, 0)

        Files.write(
            classFile,
            writer.toByteArray()
        )
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

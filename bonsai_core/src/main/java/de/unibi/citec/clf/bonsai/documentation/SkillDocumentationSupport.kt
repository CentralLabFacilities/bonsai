package de.unibi.citec.clf.bonsai.documentation

import org.objectweb.asm.AnnotationVisitor
import org.objectweb.asm.ClassReader
import org.objectweb.asm.ClassVisitor
import org.objectweb.asm.ClassWriter
import org.objectweb.asm.Opcodes
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path

data class SourceClassDocumentation(
    val binaryName: String,
    val description: String
)

/**
 * Lightweight source parser + ASM support for skill documentation.
 *
 * This intentionally is not a complete JavaDoc/KDoc parser.
 */
object SkillDocumentationSupport {

    private const val SKILL_DOCUMENTATION_DESCRIPTOR =
        "Lde/unibi/citec/clf/bonsai/engine/model/SkillDocumentation;"

    private val sourceRoots = listOf(
        "src/main/java",
        "src/main/kotlin"
    )

    /**
     * Reads all Java/Kotlin source files in a Maven module and returns the
     * current class descriptions.
     *
     * Classes without a documentation comment are also returned with an empty
     * description so an old injected annotation can be removed.
     */
    fun readSourceDocumentation(
        projectDir: Path
    ): List<SourceClassDocumentation> {
        val result = mutableListOf<SourceClassDocumentation>()

        sourceRoots.forEach { relativeRoot ->
            val sourceRoot = projectDir.resolve(relativeRoot)

            if (!Files.isDirectory(sourceRoot)) {
                return@forEach
            }

            Files.walk(sourceRoot).use { paths ->
                paths
                    .filter { Files.isRegularFile(it) }
                    .filter {
                        it.toString().endsWith(".java") ||
                                it.toString().endsWith(".kt")
                    }
                    .forEach { sourceFile ->
                        result += parseSourceFile(sourceFile)
                    }
            }
        }

        return result
    }

    fun classFileFor(
        classesDir: Path,
        binaryName: String
    ): Path {
        return classesDir.resolve(
            binaryName.replace('.', '/') + ".class"
        )
    }

    /**
     * Makes sure the compiled class contains exactly the requested
     * @SkillDocumentation value.
     *
     * @return true if the class file was changed.
     */
    fun ensureAnnotation(
        classFile: Path,
        description: String
    ): Boolean {
        val originalBytes = Files.readAllBytes(classFile)

        if (readAnnotationDescription(originalBytes) == description) {
            return false
        }

        val reader = ClassReader(originalBytes)
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
        Files.write(classFile, writer.toByteArray())

        return true
    }

    /**
     * Removes an old generated @SkillDocumentation annotation.
     *
     * @return true if the class file was changed.
     */
    fun removeAnnotation(
        classFile: Path
    ): Boolean {
        val originalBytes = Files.readAllBytes(classFile)

        if (readAnnotationDescription(originalBytes) == null) {
            return false
        }

        val reader = ClassReader(originalBytes)
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
        }

        reader.accept(visitor, 0)
        Files.write(classFile, writer.toByteArray())

        return true
    }

    private fun parseSourceFile(
        sourceFile: Path
    ): List<SourceClassDocumentation> {
        val source = Files.readString(
            sourceFile,
            StandardCharsets.UTF_8
        )

        val packageName = Regex(
            """(?m)^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)"""
        ).find(source)
            ?.groupValues
            ?.get(1)
            .orEmpty()

        val declarationRegex = Regex(
            """(?m)\b(?:enum\s+class|annotation\s+class|class|interface|record|enum|object)\s+([A-Za-z_][A-Za-z0-9_]*)\b"""
        )

        return declarationRegex.findAll(source)
            .map { match ->
                val className = match.groupValues[1]

                val binaryName =
                    if (packageName.isBlank()) {
                        className
                    } else {
                        "$packageName.$className"
                    }

                SourceClassDocumentation(
                    binaryName = binaryName,
                    description = descriptionBefore(
                        source = source,
                        declarationStart = match.range.first
                    )
                )
            }
            .toList()
    }

    private fun descriptionBefore(
        source: String,
        declarationStart: Int
    ): String {
        val commentStart = source.lastIndexOf(
            "/**",
            declarationStart
        )

        if (commentStart < 0) {
            return ""
        }

        val commentEnd = source.indexOf(
            "*/",
            commentStart + 3
        )

        if (
            commentEnd < 0 ||
            commentEnd > declarationStart
        ) {
            return ""
        }

        val between = source.substring(
            commentEnd + 2,
            declarationStart
        )

        if (
            ';' in between ||
            '{' in between ||
            '}' in between
        ) {
            return ""
        }

        val rawComment = source.substring(
            commentStart,
            commentEnd + 2
        )

        return normalizeDescription(rawComment)
    }

    private fun normalizeDescription(
        rawComment: String
    ): String {
        val body = rawComment
            .removePrefix("/**")
            .removeSuffix("*/")
            .replace("\r\n", "\n")
            .replace('\r', '\n')

        return body
            .lines()
            .map { line ->
                line
                    .replaceFirst(
                        Regex("""^\s*\*\s?"""),
                        ""
                    )
                    .trimEnd()
            }
            .dropWhile { it.isBlank() }
            .dropLastWhile { it.isBlank() }
            .joinToString("\n")
            .trim()
    }

    private fun readAnnotationDescription(
        classBytes: ByteArray
    ): String? {
        var description: String? = null

        val visitor = object : ClassVisitor(
            Opcodes.ASM9
        ) {
            override fun visitAnnotation(
                descriptor: String,
                visible: Boolean
            ): AnnotationVisitor? {
                if (descriptor != SKILL_DOCUMENTATION_DESCRIPTOR) {
                    return null
                }

                return object : AnnotationVisitor(
                    Opcodes.ASM9
                ) {
                    override fun visit(
                        name: String?,
                        value: Any?
                    ) {
                        if (
                            name == "value" &&
                            value is String
                        ) {
                            description = value
                        }
                    }
                }
            }
        }

        ClassReader(classBytes).accept(
            visitor,
            ClassReader.SKIP_CODE or
                    ClassReader.SKIP_DEBUG or
                    ClassReader.SKIP_FRAMES
        )

        return description
    }
}

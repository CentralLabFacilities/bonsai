import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class SkillValidator {

    public static void main(String[] args) {

        if (args.length != 1) {
            System.out.println();
            System.out.println("Usage:");
            System.out.println();
            System.out.println(
                    "    java SkillValidator <bonsai-src-main>"
            );
            System.out.println();
            System.out.println("Example:");
            System.out.println();
            System.out.println(
                    "    java SkillValidator " +
                            "/home/robocup_ws/src/bonsai/bonsai_skills/src/main"
            );
            System.out.println();
            System.exit(2);
        }

        Path root = Paths.get(args[0]).toAbsolutePath().normalize();

        if (!Files.exists(root)) {
            System.err.println(
                    "ERROR: Directory does not exist:"
            );
            System.err.println(root);
            System.exit(2);
        }

        if (!Files.isDirectory(root)) {
            System.err.println(
                    "ERROR: Path is not a directory:"
            );
            System.err.println(root);
            System.exit(2);
        }

        BonsaiRepositoryValidator validator =
                new BonsaiRepositoryValidator();

        List<ValidationResult> results;

        try {
            results = validator.validate(root);
        } catch (Exception e) {
            System.err.println();
            System.err.println("ERROR during validation:");
            e.printStackTrace();
            System.exit(2);
            return;
        }

        ConsoleReporter.print(results);

        Path report =
                Paths.get("skill-validation-report.json");

        try {
            JsonReporter.write(results, report);
        } catch (IOException e) {
            System.err.println(
                    "WARNING: Could not write JSON report: "
                            + e.getMessage()
            );
        }

        long failed =
                results.stream()
                        .filter(result -> !result.valid())
                        .count();

        System.out.println();

        if (failed > 0) {
            System.out.println(
                    "Validation FAILED: "
                            + failed
                            + " skill(s) have problems."
            );

            System.exit(1);
        }

        System.out.println(
                "Validation PASSED: all skills are documented correctly."
        );
    }


    // ============================================================
    // Skill Contract
    // ============================================================

    static class SkillContract {

        String name;
        String packageName;
        String sourceFile;

        Set<String> options;
        Set<String> readSlots;
        Set<String> writeSlots;
        Set<String> exitTokens;
        Set<String> actuators;
        Set<String> sensors;

        String documentation;

        SkillContract() {
            options = new LinkedHashSet<>();
            readSlots = new LinkedHashSet<>();
            writeSlots = new LinkedHashSet<>();
            exitTokens = new LinkedHashSet<>();
            actuators = new LinkedHashSet<>();
            sensors = new LinkedHashSet<>();
            documentation = "";
        }
    }

    static class ValidationResult {

        String skillName;
        String packageName;
        String sourceFile;

        boolean documentationFound;
        boolean nameMatch;

        Set<String> missingOptions;
        Set<String> undocumentedOptions;

        Set<String> missingReadSlots;
        Set<String> undocumentedReadSlots;

        Set<String> missingWriteSlots;
        Set<String> undocumentedWriteSlots;

        Set<String> missingExitTokens;
        Set<String> undocumentedExitTokens;

        Set<String> missingActuators;
        Set<String> undocumentedActuators;

        Set<String> missingSensors;
        Set<String> undocumentedSensors;

        boolean valid() {

            return documentationFound
                    && nameMatch
                    && missingOptions.isEmpty()
                    && undocumentedOptions.isEmpty()
                    && missingReadSlots.isEmpty()
                    && undocumentedReadSlots.isEmpty()
                    && missingWriteSlots.isEmpty()
                    && undocumentedWriteSlots.isEmpty()
                    && missingExitTokens.isEmpty()
                    && undocumentedExitTokens.isEmpty()
                    && missingActuators.isEmpty()
                    && undocumentedActuators.isEmpty()
                    && missingSensors.isEmpty()
                    && undocumentedSensors.isEmpty();
        }
    }

    static class SourceScanner {

        List<Path> findSourceFiles(Path root)
                throws IOException {

            try (Stream<Path> stream =
                         Files.walk(root)) {

                return stream
                        .filter(Files::isRegularFile)
                        .filter(path -> {

                            String fileName =
                                    path.getFileName()
                                            .toString()
                                            .toLowerCase();

                            return fileName.endsWith(".java")
                                    || fileName.endsWith(".kt");
                        })
                        .collect(Collectors.toList());
            }
        }
    }

    static class SkillDetector {

        private static final Pattern KOTLIN_SKILL =
                Pattern.compile(
                        "\\bclass\\s+"
                                + "([A-Za-z_][A-Za-z0-9_]*)"
                                + "\\s*(?:<[^>]+>)?"
                                + "\\s*:\\s*AbstractSkill\\b",
                        Pattern.MULTILINE
                );

        private static final Pattern JAVA_SKILL =
                Pattern.compile(
                        "\\bclass\\s+"
                                + "([A-Za-z_][A-Za-z0-9_]*)"
                                + "\\s*(?:<[^>]+>)?"
                                + "\\s+extends\\s+AbstractSkill\\b",
                        Pattern.MULTILINE
                );

        boolean isSkill(String source) {

            return KOTLIN_SKILL.matcher(source).find()
                    || JAVA_SKILL.matcher(source).find();
        }
    }

    static class SourceParser {

        private static final Pattern KOTLIN_CLASS =
                Pattern.compile(
                        "\\bclass\\s+"
                                + "([A-Za-z_][A-Za-z0-9_]*)"
                                + "\\s*(?:<[^>]+>)?"
                                + "\\s*:\\s*AbstractSkill\\b"
                );

        private static final Pattern JAVA_CLASS =
                Pattern.compile(
                        "\\bclass\\s+"
                                + "([A-Za-z_][A-Za-z0-9_]*)"
                                + "\\s*(?:<[^>]+>)?"
                                + "\\s+extends\\s+AbstractSkill\\b"
                );

        private static final Pattern KOTLIN_PACKAGE =
                Pattern.compile(
                        "(?m)^\\s*package\\s+"
                                + "([A-Za-z0-9_.]+)"
                                + "\\s*$"
                );

        private static final Pattern JAVA_PACKAGE =
                Pattern.compile(
                        "(?m)^\\s*package\\s+"
                                + "([A-Za-z0-9_.]+)"
                                + "\\s*;"
                );

        private static final Pattern CONFIG_OPTION_PATTERN =
                Pattern.compile(
                        "\\b(?:requestValue"
                                + "|requestOptionalBool"
                                + "|requestOptionalInt"
                                + "|requestOptionalDouble"
                                + "|requestOptionalLong"
                                + "|requestOptionalFloat"
                                + "|hasConfigurationKey)"
                                + "\\s*\\(\\s*\"(#_[^\"]+)\""
                );
        private static final Pattern READ_SLOT_PATTERN =
                Pattern.compile(
                        "\\bgetReadSlot\\s*\\(\\s*\"([^\"]+)\"",
                        Pattern.MULTILINE
                );

        private static final Pattern WRITE_SLOT_PATTERN =
                Pattern.compile(
                        "\\bgetWriteSlot\\s*\\(\\s*\"([^\"]+)\"",
                        Pattern.MULTILINE
                );

        private static final Pattern SUCCESS_EXIT_PATTERN =
                Pattern.compile(
                        "ExitStatus\\.SUCCESS\\(\\)"
                                + "\\.ps\\(\\s*\"([^\"]+)\"\\s*\\)"
                );

        private static final Pattern ERROR_EXIT_PATTERN =
                Pattern.compile(
                        "requestExitToken\\s*\\("
                                + "\\s*ExitStatus\\.ERROR\\s*\\("
                );

        private static final Pattern DOCUMENTATION_PATTERN =
                Pattern.compile(
                        "/\\*\\*(.*?)\\*/",
                        Pattern.DOTALL
                );


        SkillContract parse(
                String source,
                Path file
        ) {

            SkillContract contract =
                    new SkillContract();

            contract.name =
                    extractClassName(source);

            contract.packageName =
                    extractPackage(source);

            contract.sourceFile =
                    file.toAbsolutePath()
                            .normalize()
                            .toString();

            contract.options =
                    findAll(
                            OPTION_PATTERN,
                            source
                    );

            contract.readSlots =
                    findAll(
                            READ_SLOT_PATTERN,
                            source
                    );

            contract.writeSlots =
                    findAll(
                            WRITE_SLOT_PATTERN,
                            source
                    );

            contract.exitTokens =
                    extractExitTokens(source);

            contract.actuators =
                    findAll(
                            ACTUATOR_PATTERN,
                            source
                    );

            contract.sensors =
                    findAll(
                            SENSOR_PATTERN,
                            source
                    );

            contract.documentation =
                    extractDocumentation(source);

            return contract;
        }


        private String extractClassName(
                String source
        ) {

            Matcher kotlin =
                    KOTLIN_CLASS.matcher(source);

            if (kotlin.find()) {
                return kotlin.group(1);
            }

            Matcher java =
                    JAVA_CLASS.matcher(source);

            if (java.find()) {
                return java.group(1);
            }

            return "UNKNOWN";
        }


        private String extractPackage(
                String source
        ) {

            Matcher kotlin =
                    KOTLIN_PACKAGE.matcher(source);

            if (kotlin.find()) {
                return kotlin.group(1);
            }

            Matcher java =
                    JAVA_PACKAGE.matcher(source);

            if (java.find()) {
                return java.group(1);
            }

            return "UNKNOWN";
        }


        private Set<String> findAll(
                Pattern pattern,
                String source
        ) {

            Set<String> result =
                    new LinkedHashSet<>();

            Matcher matcher =
                    pattern.matcher(source);

            while (matcher.find()) {
                result.add(
                        matcher.group(1)
                );
            }

            return result;
        }


        private Set<String> extractExitTokens(
                String source
        ) {

            Set<String> result =
                    new LinkedHashSet<>();

            Pattern successPattern =
                    SUCCESS_EXIT_PATTERN;

            Matcher success =
                    successPattern.matcher(source);

            while (success.find()) {

                result.add(
                        "success."
                                + success.group(1)
                );
            }

            Matcher error =
                    ERROR_EXIT_PATTERN.matcher(source);

            if (error.find()) {
                result.add("error");
            }

            return result;
        }


        private String extractDocumentation(
                String source
        ) {

            Matcher matcher =
                    DOCUMENTATION_PATTERN.matcher(source);

            if (!matcher.find()) {
                return "";
            }

            String documentation =
                    matcher.group(1);

            StringBuilder result =
                    new StringBuilder();

            String[] lines =
                    documentation.split("\\R");

            for (String line : lines) {

                String cleaned =
                        line.trim();

                if (cleaned.startsWith("*")) {
                    cleaned =
                            cleaned.substring(1).trim();
                }

                result.append(cleaned);
                result.append("\n");
            }

            return result.toString().trim();
        }
    }

    static class DocumentationParser {

        private static final String[] SECTIONS = {
                "Options",
                "Slots",
                "ExitTokens",
                "Sensors",
                "Actuators"
        };


        SkillContract parse(
                String documentation,
                SkillContract code
        ) {

            SkillContract document =
                    new SkillContract();

            document.name =
                    extractDocumentedName(
                            documentation,
                            code.name
                    );

            document.packageName =
                    code.packageName;

            document.sourceFile =
                    code.sourceFile;

            document.documentation =
                    documentation;

            document.options =
                    extractOptions(documentation);

            document.readSlots =
                    extractSlots(
                            documentation,
                            "Read"
                    );

            document.writeSlots =
                    extractSlots(
                            documentation,
                            "Write"
                    );

            document.exitTokens =
                    extractExitTokens(
                            documentation
                    );

            document.actuators =
                    extractSimpleSection(
                            documentation,
                            "Actuators"
                    );

            document.sensors =
                    extractSimpleSection(
                            documentation,
                            "Sensors"
                    );

            return document;
        }


        private String extractDocumentedName(
                String documentation,
                String fallback
        ) {

            Pattern pattern =
                    Pattern.compile(
                            "(?im)^\\s*(?:Skill|Name)"
                                    + "\\s*:\\s*"
                                    + "([A-Za-z_][A-Za-z0-9_]*)"
                    );

            Matcher matcher =
                    pattern.matcher(documentation);

            if (matcher.find()) {
                return matcher.group(1);
            }

            return fallback;
        }


        private String getSection(
                String documentation,
                String section
        ) {

            StringBuilder next =
                    new StringBuilder();

            for (String candidate : SECTIONS) {

                if (!candidate.equals(section)) {

                    if (next.length() > 0) {
                        next.append("|");
                    }

                    next.append(
                            Pattern.quote(candidate)
                    );
                }
            }

            String regex =
                    "(?ims)^\\s*"
                            + Pattern.quote(section)
                            + "\\s*:?\\s*"
                            + "(.*?)"
                            + "(?=^\\s*(?:"
                            + next
                            + ")\\s*:|\\z)";

            Pattern pattern =
                    Pattern.compile(regex);

            Matcher matcher =
                    pattern.matcher(documentation);

            if (matcher.find()) {
                return matcher.group(1);
            }

            return "";
        }


        private Set<String> extractOptions(
                String documentation
        ) {

            String section =
                    getSection(
                            documentation,
                            "Options"
                    );

            Pattern pattern =
                    Pattern.compile(
                            "#_[A-Za-z0-9_]+"
                    );

            Set<String> result =
                    new LinkedHashSet<>();

            Matcher matcher =
                    pattern.matcher(section);

            while (matcher.find()) {
                result.add(matcher.group());
            }

            return result;
        }


        private Set<String> extractSlots(
                String documentation,
                String direction
        ) {

            String section =
                    getSection(
                            documentation,
                            "Slots"
                    );

            Set<String> result =
                    new LinkedHashSet<>();

            /*
             * Examples:
             *
             * PersonDataListReadSlot:
             *     [PersonDataList] (Read)
             *
             * GestureReadSlot:
             *     [String] (Optional, Read)
             *
             * ArmWriteSlot:
             *     [Arm] (Write)
             */

            Pattern pattern =
                    Pattern.compile(
                            "(?im)^\\s*"
                                    + "(?:[-*]\\s*)?"
                                    + "([A-Za-z_][A-Za-z0-9_]*)"
                                    + "\\s*:?.*?\\b"
                                    + Pattern.quote(direction)
                                    + "\\b"
                    );

            Matcher matcher =
                    pattern.matcher(section);

            while (matcher.find()) {

                result.add(
                        matcher.group(1)
                );
            }

            return result;
        }


        private Set<String> extractExitTokens(
                String documentation
        ) {

            String section =
                    getSection(
                            documentation,
                            "ExitTokens"
                    );

            Set<String> result =
                    new LinkedHashSet<>();

            /*
             * Example:
             *
             * success.notEmpty:
             * success.empty:
             * error:
             */

            Pattern colonPattern =
                    Pattern.compile(
                            "(?im)^\\s*"
                                    + "(?:[-*]\\s*)?"
                                    + "([A-Za-z_][A-Za-z0-9_.]*)"
                                    + "\\s*:"
                    );

            Matcher colonMatcher =
                    colonPattern.matcher(section);

            while (colonMatcher.find()) {

                result.add(
                        colonMatcher.group(1)
                );
            }

            /*
             * Also support:
             *
             * - success.notEmpty
             * - error
             */

            Pattern listPattern =
                    Pattern.compile(
                            "(?im)^\\s*[-*]\\s*"
                                    + "([A-Za-z_][A-Za-z0-9_.]*)"
                                    + "\\s*$"
                    );

            Matcher listMatcher =
                    listPattern.matcher(section);

            while (listMatcher.find()) {

                result.add(
                        listMatcher.group(1)
                );
            }

            return result;
        }


        private Set<String> extractSimpleSection(
                String documentation,
                String sectionName
        ) {

            String section =
                    getSection(
                            documentation,
                            sectionName
                    );

            Set<String> result =
                    new LinkedHashSet<>();

            /*
             * We mainly expect:
             *
             * Actuators:
             *   ECWMSpirit
             *
             * Sensors:
             *   SomeSensor
             */

            String[] lines =
                    section.split("\\R");

            for (String line : lines) {

                String cleaned =
                        line.trim();

                if (cleaned.isEmpty()) {
                    continue;
                }

                if (cleaned.startsWith("->")) {
                    continue;
                }

                if (cleaned.startsWith("[")) {
                    continue;
                }

                if (cleaned.startsWith("-")) {
                    cleaned =
                            cleaned.substring(1)
                                    .trim();
                }

                if (cleaned.startsWith("*")) {
                    cleaned =
                            cleaned.substring(1)
                                    .trim();
                }

                /*
                 * Ignore normal descriptive sentences.
                 */
                if (cleaned.contains(" ")) {
                    continue;
                }

                if (cleaned.equalsIgnoreCase("none")) {
                    continue;
                }

                if (cleaned.matches(
                        "[A-Za-z_][A-Za-z0-9_.]*"
                )) {

                    result.add(cleaned);
                }
            }

            return result;
        }
    }

    static class SkillContractValidator {

        ValidationResult validate(
                SkillContract code,
                SkillContract documentation
        ) {

            ValidationResult result =
                    new ValidationResult();

            result.skillName =
                    code.name;

            result.packageName =
                    code.packageName;

            result.sourceFile =
                    code.sourceFile;

            result.documentationFound =
                    documentation.documentation != null
                            && !documentation.documentation.isBlank();

            result.nameMatch =
                    code.name.equals(
                            documentation.name
                    );

            result.missingOptions =
                    difference(
                            code.options,
                            documentation.options
                    );

            result.undocumentedOptions =
                    difference(
                            documentation.options,
                            code.options
                    );

            result.missingReadSlots =
                    difference(
                            code.readSlots,
                            documentation.readSlots
                    );

            result.undocumentedReadSlots =
                    difference(
                            documentation.readSlots,
                            code.readSlots
                    );

            result.missingWriteSlots =
                    difference(
                            code.writeSlots,
                            documentation.writeSlots
                    );

            result.undocumentedWriteSlots =
                    difference(
                            documentation.writeSlots,
                            code.writeSlots
                    );

            result.missingExitTokens =
                    difference(
                            code.exitTokens,
                            documentation.exitTokens
                    );

            result.undocumentedExitTokens =
                    difference(
                            documentation.exitTokens,
                            code.exitTokens
                    );

            result.missingActuators =
                    difference(
                            code.actuators,
                            documentation.actuators
                    );

            result.undocumentedActuators =
                    difference(
                            documentation.actuators,
                            code.actuators
                    );

            result.missingSensors =
                    difference(
                            code.sensors,
                            documentation.sensors
                    );

            result.undocumentedSensors =
                    difference(
                            documentation.sensors,
                            code.sensors
                    );

            return result;
        }

        private Set<String> difference(
                Set<String> first,
                Set<String> second
        ) {

            Set<String> result =
                    new LinkedHashSet<>(first);

            result.removeAll(second);

            return result;
        }
    }

    static class BonsaiRepositoryValidator {

        private final SourceScanner scanner =
                new SourceScanner();

        private final SkillDetector detector =
                new SkillDetector();

        private final SourceParser parser =
                new SourceParser();

        private final DocumentationParser documentationParser =
                new DocumentationParser();

        private final SkillContractValidator validator =
                new SkillContractValidator();


        List<ValidationResult> validate(
                Path root
        ) throws IOException {

            List<ValidationResult> results =
                    new ArrayList<>();

            List<Path> files =
                    scanner.findSourceFiles(root);

            System.out.println();
            System.out.println(
                    "Scanning Bonsai skills"
            );
            System.out.println(
                    "----------------------"
            );
            System.out.println(
                    "Root: " + root
            );
            System.out.println(
                    "Source files: " + files.size()
            );
            System.out.println();

            for (Path file : files) {

                String source;

                try {

                    source =
                            Files.readString(
                                    file,
                                    StandardCharsets.UTF_8
                            );

                } catch (Exception e) {

                    System.out.println(
                            "WARNING: Could not read "
                                    + file
                                    + ": "
                                    + e.getMessage()
                    );

                    continue;
                }

                /*
                 * Skip normal Java/Kotlin classes.
                 */
                if (!detector.isSkill(source)) {
                    continue;
                }

                SkillContract code =
                        parser.parse(
                                source,
                                file
                        );

                System.out.println(
                        "Found skill: "
                                + code.packageName
                                + "."
                                + code.name
                );

                /*
                 * No JavaDoc/KDoc.
                 */
                if (code.documentation == null
                        || code.documentation.isBlank()) {

                    ValidationResult result =
                            emptyDocumentationResult(
                                    code
                            );

                    results.add(result);

                    continue;
                }

                SkillContract documentation =
                        documentationParser.parse(
                                code.documentation,
                                code
                        );

                ValidationResult result =
                        validator.validate(
                                code,
                                documentation
                        );

                results.add(result);
            }

            return results;
        }


        private ValidationResult emptyDocumentationResult(
                SkillContract code
        ) {

            ValidationResult result =
                    new ValidationResult();

            result.skillName =
                    code.name;

            result.packageName =
                    code.packageName;

            result.sourceFile =
                    code.sourceFile;

            result.documentationFound =
                    false;

            result.nameMatch =
                    false;

            result.missingOptions =
                    new LinkedHashSet<>(
                            code.options
                    );

            result.undocumentedOptions =
                    new LinkedHashSet<>();

            result.missingReadSlots =
                    new LinkedHashSet<>(
                            code.readSlots
                    );

            result.undocumentedReadSlots =
                    new LinkedHashSet<>();

            result.missingWriteSlots =
                    new LinkedHashSet<>(
                            code.writeSlots
                    );

            result.undocumentedWriteSlots =
                    new LinkedHashSet<>();

            result.missingExitTokens =
                    new LinkedHashSet<>(
                            code.exitTokens
                    );

            result.undocumentedExitTokens =
                    new LinkedHashSet<>();

            result.missingActuators =
                    new LinkedHashSet<>(
                            code.actuators
                    );

            result.undocumentedActuators =
                    new LinkedHashSet<>();

            result.missingSensors =
                    new LinkedHashSet<>(
                            code.sensors
                    );

            result.undocumentedSensors =
                    new LinkedHashSet<>();

            return result;
        }
    }

    static class ConsoleReporter {

        static void print(
                List<ValidationResult> results
        ) {

            System.out.println();
            System.out.println(
                    "============================================================"
            );
            System.out.println(
                    "              BONSAI SKILL VALIDATION"
            );
            System.out.println(
                    "============================================================"
            );

            long passed =
                    results.stream()
                            .filter(
                                    ValidationResult::valid
                            )
                            .count();

            long failed =
                    results.size() - passed;

            System.out.println();
            System.out.println(
                    "Skills checked : "
                            + results.size()
            );

            System.out.println(
                    "Passed         : "
                            + passed
            );

            System.out.println(
                    "Failed         : "
                            + failed
            );

            System.out.println();
            System.out.println(
                    "------------------------------------------------------------"
            );

            List<ValidationResult> sorted =
                    new ArrayList<>(results);

            sorted.sort(
                    (a, b) ->
                            a.skillName.compareToIgnoreCase(
                                    b.skillName
                            )
            );

            for (ValidationResult result : sorted) {

                if (result.valid()) {

                    System.out.println();
                    System.out.println(
                            "[PASS] "
                                    + result.packageName
                                    + "."
                                    + result.skillName
                    );

                    continue;
                }

                System.out.println();
                System.out.println(
                        "[FAIL] "
                                + result.packageName
                                + "."
                                + result.skillName
                );

                System.out.println(
                        "  File: "
                                + result.sourceFile
                );

                if (!result.documentationFound) {

                    System.out.println(
                            "  Documentation: MISSING"
                    );
                }

                if (!result.nameMatch) {

                    System.out.println(
                            "  Skill name does not match"
                    );
                }

                printMismatch(
                        "Options",
                        result.missingOptions,
                        result.undocumentedOptions
                );

                printMismatch(
                        "Read Slots",
                        result.missingReadSlots,
                        result.undocumentedReadSlots
                );

                printMismatch(
                        "Write Slots",
                        result.missingWriteSlots,
                        result.undocumentedWriteSlots
                );

                printMismatch(
                        "Exit Tokens",
                        result.missingExitTokens,
                        result.undocumentedExitTokens
                );

                printMismatch(
                        "Actuators",
                        result.missingActuators,
                        result.undocumentedActuators
                );

                printMismatch(
                        "Sensors",
                        result.missingSensors,
                        result.undocumentedSensors
                );
            }

            System.out.println();
            System.out.println(
                    "============================================================"
            );
        }


        private static void printMismatch(
                String type,
                Set<String> missing,
                Set<String> undocumented
        ) {

            if (missing.isEmpty()
                    && undocumented.isEmpty()) {

                return;
            }

            System.out.println();
            System.out.println(
                    "  " + type + ":"
            );

            List<String> sortedMissing =
                    new ArrayList<>(missing);

            Collections.sort(sortedMissing);

            for (String value : sortedMissing) {

                System.out.println(
                        "    - Missing in documentation: "
                                + value
                );
            }

            List<String> sortedUndocumented =
                    new ArrayList<>(undocumented);

            Collections.sort(sortedUndocumented);

            for (String value : sortedUndocumented) {

                System.out.println(
                        "    - Only in documentation: "
                                + value
                );
            }
        }
    }

    static class JsonReporter {

        static void write(
                List<ValidationResult> results,
                Path output
        ) throws IOException {

            StringBuilder json =
                    new StringBuilder();

            json.append("[\n");

            for (int i = 0;
                 i < results.size();
                 i++) {

                ValidationResult r =
                        results.get(i);

                json.append("  {\n");

                appendString(
                        json,
                        "skillName",
                        r.skillName,
                        true
                );

                appendString(
                        json,
                        "packageName",
                        r.packageName,
                        true
                );

                appendString(
                        json,
                        "sourceFile",
                        r.sourceFile,
                        true
                );

                appendBoolean(
                        json,
                        "documentationFound",
                        r.documentationFound,
                        true
                );

                appendBoolean(
                        json,
                        "valid",
                        r.valid(),
                        true
                );

                appendArray(
                        json,
                        "missingOptions",
                        r.missingOptions,
                        true
                );

                appendArray(
                        json,
                        "undocumentedOptions",
                        r.undocumentedOptions,
                        true
                );

                appendArray(
                        json,
                        "missingReadSlots",
                        r.missingReadSlots,
                        true
                );

                appendArray(
                        json,
                        "undocumentedReadSlots",
                        r.undocumentedReadSlots,
                        true
                );

                appendArray(
                        json,
                        "missingWriteSlots",
                        r.missingWriteSlots,
                        true
                );

                appendArray(
                        json,
                        "undocumentedWriteSlots",
                        r.undocumentedWriteSlots,
                        true
                );

                appendArray(
                        json,
                        "missingExitTokens",
                        r.missingExitTokens,
                        true
                );

                appendArray(
                        json,
                        "undocumentedExitTokens",
                        r.undocumentedExitTokens,
                        true
                );

                appendArray(
                        json,
                        "missingActuators",
                        r.missingActuators,
                        true
                );

                appendArray(
                        json,
                        "undocumentedActuators",
                        r.undocumentedActuators,
                        true
                );

                appendArray(
                        json,
                        "missingSensors",
                        r.missingSensors,
                        true
                );

                appendArray(
                        json,
                        "undocumentedSensors",
                        r.undocumentedSensors,
                        false
                );

                json.append("  }");

                if (i < results.size() - 1) {
                    json.append(",");
                }

                json.append("\n");
            }

            json.append("]\n");

            Files.writeString(
                    output,
                    json.toString(),
                    StandardCharsets.UTF_8
            );

            System.out.println();
            System.out.println(
                    "JSON report written to:"
            );
            System.out.println(
                    output.toAbsolutePath()
            );
        }


        private static void appendString(
                StringBuilder json,
                String name,
                String value,
                boolean comma
        ) {

            json.append("    \"")
                    .append(name)
                    .append("\": \"")
                    .append(escape(value))
                    .append("\"");

            if (comma) {
                json.append(",");
            }

            json.append("\n");
        }


        private static void appendBoolean(
                StringBuilder json,
                String name,
                boolean value,
                boolean comma
        ) {

            json.append("    \"")
                    .append(name)
                    .append("\": ")
                    .append(value);

            if (comma) {
                json.append(",");
            }

            json.append("\n");
        }


        private static void appendArray(
                StringBuilder json,
                String name,
                Set<String> values,
                boolean comma
        ) {

            List<String> sorted =
                    new ArrayList<>(values);

            Collections.sort(sorted);

            json.append("    \"")
                    .append(name)
                    .append("\": [");

            for (int i = 0;
                 i < sorted.size();
                 i++) {

                if (i > 0) {
                    json.append(", ");
                }

                json.append("\"")
                        .append(
                                escape(
                                        sorted.get(i)
                                )
                        )
                        .append("\"");
            }

            json.append("]");

            if (comma) {
                json.append(",");
            }

            json.append("\n");
        }


        private static String escape(
                String value
        ) {

            if (value == null) {
                return "";
            }

            return value
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");
        }
    }
}
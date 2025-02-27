package de.unibi.citec.clf.bonsai.test.actuators;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.btl.data.speechrec.Language;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import javax.annotation.Nonnull;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public class SpeechActuatorStub implements de.unibi.citec.clf.bonsai.actuators.SpeechActuator {

    public SpeechActuatorStub() {
    }

    @Override
    public void configure(IObjectConfigurator conf) throws ConfigurationException {

    }

    @Override
    public void cleanUp() {

    }
    
    @Nullable
    @Override
    public Future<Boolean> enableASR(boolean enable) throws IOException {
        return null;
    }

    @NotNull
    @Override
    public Future<Void> sayAsync(@NotNull String text, @NotNull Language language) throws IOException {
        return new Future<Void>() {
            @Override
            public boolean cancel(boolean b) {
                return false;
            }

            @Override
            public boolean isCancelled() {
                return false;
            }

            @Override
            public boolean isDone() {
                return true;
            }

            @Override
            public Void get() throws InterruptedException, ExecutionException {
                return null;
            }

            @Override
            public Void get(long l, TimeUnit timeUnit) throws InterruptedException, ExecutionException, TimeoutException {
                return null;
            }
        };
    }

    @NotNull
    @Override
    public Future<String> sayTranslated(@NotNull String text, @NotNull Language speakLanguage, @NotNull Language textLanguage) throws IOException {
        return null;
    }
}

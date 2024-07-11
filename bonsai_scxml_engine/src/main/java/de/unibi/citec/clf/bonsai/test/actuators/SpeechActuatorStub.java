package de.unibi.citec.clf.bonsai.test.actuators;

import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import org.jetbrains.annotations.NotNull;

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
    public Future<Void> sayAsync(@Nonnull String text) throws IOException {
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

    @Override
    public Future<Boolean> enableASR(@NotNull Boolean b) throws IOException {
        return null;
    }

    @Override
    public void say(@Nonnull String text) throws IOException {

    }

    @Override
    public void sayAccentuated(String accented_text) throws IOException {

    }

    @Override
    public void sayAccentuated(String accented_text, String prosodyConfig) throws IOException {

    }

    @Override
    public void sayAccentuated(String accented_text, boolean async) throws IOException {

    }

    @Override
    public void sayAccentuated(String accented_text, boolean async, String prosodyConfig) throws IOException {

    }

    @Override
    public void configure(IObjectConfigurator conf) throws ConfigurationException {

    }

    @Override
    public void cleanUp() {

    }
}

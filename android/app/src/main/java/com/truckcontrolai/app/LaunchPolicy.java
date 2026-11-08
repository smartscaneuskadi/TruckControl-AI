package com.truckcontrolai.app;

import java.net.URI;
import java.net.URISyntaxException;

/** Exact application origin only. Does not log personal callback URLs. */
final class LaunchPolicy {
    static final String HOME = "https://truckcontrolai.com/";
    private LaunchPolicy() {}

    static boolean allows(String value) {
        if (value == null || value.length() > 8192) return false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isISOControl(c) || c == '\\') return false;
        }
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme())
                && "truckcontrolai.com".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (URISyntaxException error) {
            return false;
        }
    }
}

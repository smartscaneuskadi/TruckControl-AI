package com.truckcontrolai.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class LaunchPolicyTest {
    @Test public void acceptsOnlyTheApplicationHttpsOrigin() {
        for (String url : new String[] {
            "https://truckcontrolai.com", "https://truckcontrolai.com/",
            "https://TRUCKCONTROLAI.COM:443/#/dashboard",
            "https://truckcontrolai.com/gmail-callback?code=ficticio&state=demo",
            "https://truckcontrolai.com/#/confirmar?token=ficticio"
        }) assertTrue(url, LaunchPolicy.allows(url));
    }
    @Test public void rejectsForeignAndUnsupportedSchemes() {
        for (String url : new String[] {
            "http://truckcontrolai.com/", "javascript:alert(1)",
            "file:///data/data/com.truckcontrolai.app/files/data",
            "content://com.truckcontrolai.app/private",
            "intent://truckcontrolai.com/", "//truckcontrolai.com/", ""
        }) assertFalse(url, LaunchPolicy.allows(url));
        assertFalse(LaunchPolicy.allows(null));
    }
    @Test public void rejectsDeceptiveHostsAndUserInformation() {
        for (String url : new String[] {
            "https://truckcontrolai.com.evil.invalid/", "https://evil.invalid/",
            "https://truckcontrolai.com./", "https://www.truckcontrolai.com/",
            "https://truckcontrolai%2ecom/", "https://owner@truckcontrolai.com/",
            "https://truckcontrolai.com@evil.invalid/", "https://truckcontrolai.com:8443/"
        }) assertFalse(url, LaunchPolicy.allows(url));
    }
    @Test public void rejectsMalformedAndBackslashUris() {
        for (String url : new String[] {
            "https://truckcontrolai.com/%", "https://truckcontrolai.com\\@evil.invalid/",
            "https://truckcontrolai.com:bad/", "https://[truckcontrolai.com]/"
        }) assertFalse(url, LaunchPolicy.allows(url));
    }
    @Test public void rejectsControlsAndExcessiveLength() {
        for (char c = 0; c < 32; c++) assertFalse(LaunchPolicy.allows("https://truckcontrolai.com/" + c));
        assertFalse(LaunchPolicy.allows("https://truckcontrolai.com/" + (char) 127));
        assertFalse(LaunchPolicy.allows("https://truckcontrolai.com/" + "x".repeat(8193)));
    }
}

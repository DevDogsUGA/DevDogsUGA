export const Constants = {
    graphql_public: {
        Enums: {},
    },
    public: {
        Enums: {
            contentAction: ["quarantine", "no_action"],
            credentialType: ["email_password", "totp", "email_password_totp"],
            feedbackSeverity: ["low", "medium", "high"],
            feedbackStatus: ["open", "in_review", "resolved", "dismissed"],
            feedbackType: [
                "bug_report",
                "feature_request",
                "design_feedback",
                "performance",
                "content_issue",
                "other",
            ],
            filerAction: ["warn", "suspend", "no_action"],
            graduationSemester: ["spring", "summer", "fall"],
            oauthRegistrationType: ["development", "production"],
            reportStatus: ["unverified", "pending", "resolved", "dismissed"],
            roleType: ["default", "root", "custom"],
            subjectAction: ["warn", "suspend", "ban", "no_action"],
        },
    },
    storage: {
        Enums: {
            buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
        },
    },
};

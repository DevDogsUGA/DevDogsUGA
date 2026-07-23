export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      contentReports: {
        Row: {
          clientId: string
          contentId: string
          contentSnapshot: string
          contentTypeId: string | null
          contentUrl: string | null
          createdAt: string
          description: string | null
          id: string
          nextVerifyAt: string | null
          reasonId: string
          reportedUserId: string
          reporterUserId: string
          resolvedAt: string | null
          status: Database["public"]["Enums"]["reportStatus"]
          verifyAttempts: number
        }
        Insert: {
          clientId: string
          contentId: string
          contentSnapshot: string
          contentTypeId?: string | null
          contentUrl?: string | null
          createdAt?: string
          description?: string | null
          id?: string
          nextVerifyAt?: string | null
          reasonId: string
          reportedUserId: string
          reporterUserId: string
          resolvedAt?: string | null
          status?: Database["public"]["Enums"]["reportStatus"]
          verifyAttempts?: number
        }
        Update: {
          clientId?: string
          contentId?: string
          contentSnapshot?: string
          contentTypeId?: string | null
          contentUrl?: string | null
          createdAt?: string
          description?: string | null
          id?: string
          nextVerifyAt?: string | null
          reasonId?: string
          reportedUserId?: string
          reporterUserId?: string
          resolvedAt?: string | null
          status?: Database["public"]["Enums"]["reportStatus"]
          verifyAttempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "contentReports_clientId_contentTypeId_fkey"
            columns: ["clientId", "contentTypeId"]
            isOneToOne: false
            referencedRelation: "reportContentTypes"
            referencedColumns: ["clientId", "id"]
          },
          {
            foreignKeyName: "contentReports_clientId_reasonId_fkey"
            columns: ["clientId", "reasonId"]
            isOneToOne: false
            referencedRelation: "reportReasons"
            referencedColumns: ["clientId", "id"]
          },
        ]
      }
      credentialRoles: {
        Row: {
          credentialId: string
          roleId: string
        }
        Insert: {
          credentialId: string
          roleId: string
        }
        Update: {
          credentialId?: string
          roleId?: string
        }
        Relationships: [
          {
            foreignKeyName: "credentialRoles_credentialId_credentials_id_fkey"
            columns: ["credentialId"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentialRoles_roleId_roles_id_fkey"
            columns: ["roleId"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          createdAt: string
          createdBy: string | null
          description: string | null
          email: string | null
          id: string
          name: string
          passwordSecretId: string | null
          totpSecretId: string | null
          type: Database["public"]["Enums"]["credentialType"]
        }
        Insert: {
          createdAt?: string
          createdBy?: string | null
          description?: string | null
          email?: string | null
          id?: string
          name: string
          passwordSecretId?: string | null
          totpSecretId?: string | null
          type: Database["public"]["Enums"]["credentialType"]
        }
        Update: {
          createdAt?: string
          createdBy?: string | null
          description?: string | null
          email?: string | null
          id?: string
          name?: string
          passwordSecretId?: string | null
          totpSecretId?: string | null
          type?: Database["public"]["Enums"]["credentialType"]
        }
        Relationships: []
      }
      feedbackTopics: {
        Row: {
          clientId: string
          createdAt: string
          id: string
          label: string
        }
        Insert: {
          clientId: string
          createdAt?: string
          id?: string
          label: string
        }
        Update: {
          clientId?: string
          createdAt?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      leaderboardProfiles: {
        Row: {
          allTimePoints: number
          allTimeRanking: number | null
          avatarUrl: string | null
          currentYearPoints: number
          currentYearRanking: number | null
          githubId: string
          githubLogin: string
        }
        Insert: {
          allTimePoints?: number
          allTimeRanking?: number | null
          avatarUrl?: string | null
          currentYearPoints?: number
          currentYearRanking?: number | null
          githubId: string
          githubLogin: string
        }
        Update: {
          allTimePoints?: number
          allTimeRanking?: number | null
          avatarUrl?: string | null
          currentYearPoints?: number
          currentYearRanking?: number | null
          githubId?: string
          githubLogin?: string
        }
        Relationships: []
      }
      moderatorRoles: {
        Row: {
          clientId: string
          createdAt: string
          grantedByUserId: string
          id: string
          userId: string
        }
        Insert: {
          clientId: string
          createdAt?: string
          grantedByUserId: string
          id?: string
          userId: string
        }
        Update: {
          clientId?: string
          createdAt?: string
          grantedByUserId?: string
          id?: string
          userId?: string
        }
        Relationships: []
      }
      oauthRegistrations: {
        Row: {
          clientId: string
          reportWebhookSecretId: string | null
          reportWebhookUrl: string | null
          type: Database["public"]["Enums"]["oauthRegistrationType"]
          userId: string
        }
        Insert: {
          clientId: string
          reportWebhookSecretId?: string | null
          reportWebhookUrl?: string | null
          type?: Database["public"]["Enums"]["oauthRegistrationType"]
          userId: string
        }
        Update: {
          clientId?: string
          reportWebhookSecretId?: string | null
          reportWebhookUrl?: string | null
          type?: Database["public"]["Enums"]["oauthRegistrationType"]
          userId?: string
        }
        Relationships: []
      }
      oauthTestAccounts: {
        Row: {
          createdAt: string
          ownerUserId: string
          testUserId: string
        }
        Insert: {
          createdAt?: string
          ownerUserId: string
          testUserId: string
        }
        Update: {
          createdAt?: string
          ownerUserId?: string
          testUserId?: string
        }
        Relationships: []
      }
      points: {
        Row: {
          academyPoints: number
          leaderboardProfileId: string
          longestStreakLength: number
          points: number
          projectPoints: number
          streakBonusPoints: number
          streakLength: number
          streakStart: string
          year: number
        }
        Insert: {
          academyPoints?: number
          leaderboardProfileId: string
          longestStreakLength?: number
          points?: number
          projectPoints?: number
          streakBonusPoints?: number
          streakLength?: number
          streakStart: string
          year: number
        }
        Update: {
          academyPoints?: number
          leaderboardProfileId?: string
          longestStreakLength?: number
          points?: number
          projectPoints?: number
          streakBonusPoints?: number
          streakLength?: number
          streakStart?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "points_leaderboardProfileId_leaderboardProfiles_githubId_fkey"
            columns: ["leaderboardProfileId"]
            isOneToOne: false
            referencedRelation: "leaderboardProfiles"
            referencedColumns: ["githubId"]
          },
        ]
      }
      profile: {
        Row: {
          bio: string | null
          graduationSemester:
            | Database["public"]["Enums"]["graduationSemester"]
            | null
          graduationYear: number | null
          involvementFirstName: string | null
          involvementImportedAt: string | null
          involvementLastName: string | null
          preferredName: string
          pronouns: string[] | null
          roleDescription: string | null
          showDiscord: boolean
          showEmail: boolean
          showGithub: boolean
          showLinkedin: boolean
          userId: string
          viewedConsole: boolean
        }
        Insert: {
          bio?: string | null
          graduationSemester?:
            | Database["public"]["Enums"]["graduationSemester"]
            | null
          graduationYear?: number | null
          involvementFirstName?: string | null
          involvementImportedAt?: string | null
          involvementLastName?: string | null
          preferredName: string
          pronouns?: string[] | null
          roleDescription?: string | null
          showDiscord?: boolean
          showEmail?: boolean
          showGithub?: boolean
          showLinkedin?: boolean
          userId: string
          viewedConsole?: boolean
        }
        Update: {
          bio?: string | null
          graduationSemester?:
            | Database["public"]["Enums"]["graduationSemester"]
            | null
          graduationYear?: number | null
          involvementFirstName?: string | null
          involvementImportedAt?: string | null
          involvementLastName?: string | null
          preferredName?: string
          pronouns?: string[] | null
          roleDescription?: string | null
          showDiscord?: boolean
          showEmail?: boolean
          showGithub?: boolean
          showLinkedin?: boolean
          userId?: string
          viewedConsole?: boolean
        }
        Relationships: []
      }
      profileLinks: {
        Row: {
          createdAt: string | null
          id: string
          sortOrder: number
          title: string
          url: string
          userId: string
        }
        Insert: {
          createdAt?: string | null
          id?: string
          sortOrder?: number
          title: string
          url: string
          userId: string
        }
        Update: {
          createdAt?: string | null
          id?: string
          sortOrder?: number
          title?: string
          url?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "profileLinks_userId_profile_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["userId"]
          },
          {
            foreignKeyName: "profileLinks_userId_profile_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "profileWithVerification"
            referencedColumns: ["userId"]
          },
        ]
      }
      reportContentTypes: {
        Row: {
          clientId: string
          createdAt: string
          id: string
          label: string
        }
        Insert: {
          clientId: string
          createdAt?: string
          id?: string
          label: string
        }
        Update: {
          clientId?: string
          createdAt?: string
          id?: string
          label?: string
        }
        Relationships: []
      }
      reportCorroborations: {
        Row: {
          createdAt: string
          description: string | null
          id: string
          reasonId: string
          reporterUserId: string
          reportId: string
        }
        Insert: {
          createdAt?: string
          description?: string | null
          id?: string
          reasonId: string
          reporterUserId: string
          reportId: string
        }
        Update: {
          createdAt?: string
          description?: string | null
          id?: string
          reasonId?: string
          reporterUserId?: string
          reportId?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportCorroborations_reasonId_fkey"
            columns: ["reasonId"]
            isOneToOne: false
            referencedRelation: "reportReasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportCorroborations_reportId_contentReports_id_fkey"
            columns: ["reportId"]
            isOneToOne: false
            referencedRelation: "contentReports"
            referencedColumns: ["id"]
          },
        ]
      }
      reportReasons: {
        Row: {
          clientId: string
          createdAt: string
          description: string | null
          id: string
          title: string
        }
        Insert: {
          clientId: string
          createdAt?: string
          description?: string | null
          id?: string
          title: string
        }
        Update: {
          clientId?: string
          createdAt?: string
          description?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      reportResolutions: {
        Row: {
          appliedGlobally: boolean
          contentAction: Database["public"]["Enums"]["contentAction"]
          createdAt: string
          filerAction: Database["public"]["Enums"]["filerAction"]
          id: string
          moderatorNote: string | null
          moderatorUserId: string
          nextRetryAt: string | null
          notifiedAt: string | null
          reportId: string
          subjectAction: Database["public"]["Enums"]["subjectAction"]
          webhookAttempts: number
        }
        Insert: {
          appliedGlobally?: boolean
          contentAction: Database["public"]["Enums"]["contentAction"]
          createdAt?: string
          filerAction: Database["public"]["Enums"]["filerAction"]
          id?: string
          moderatorNote?: string | null
          moderatorUserId: string
          nextRetryAt?: string | null
          notifiedAt?: string | null
          reportId: string
          subjectAction: Database["public"]["Enums"]["subjectAction"]
          webhookAttempts?: number
        }
        Update: {
          appliedGlobally?: boolean
          contentAction?: Database["public"]["Enums"]["contentAction"]
          createdAt?: string
          filerAction?: Database["public"]["Enums"]["filerAction"]
          id?: string
          moderatorNote?: string | null
          moderatorUserId?: string
          nextRetryAt?: string | null
          notifiedAt?: string | null
          reportId?: string
          subjectAction?: Database["public"]["Enums"]["subjectAction"]
          webhookAttempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "reportResolutions_reportId_contentReports_id_fkey"
            columns: ["reportId"]
            isOneToOne: true
            referencedRelation: "contentReports"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          canCreateCredentials: boolean | null
          canManageFeedback: boolean | null
          canManageRoles: boolean | null
          canManageSuspensions: boolean | null
          canManageVerification: boolean | null
          canModerate: boolean | null
          canViewAuditLog: boolean | null
          color: string | null
          createdAt: string
          description: string
          discordRoleId: string | null
          discordSyncedColor: number | null
          discordSyncedName: string | null
          id: string
          isLeadership: boolean
          rank: number | null
          roleType: Database["public"]["Enums"]["roleType"]
          showOnProfile: boolean
          title: string
        }
        Insert: {
          canCreateCredentials?: boolean | null
          canManageFeedback?: boolean | null
          canManageRoles?: boolean | null
          canManageSuspensions?: boolean | null
          canManageVerification?: boolean | null
          canModerate?: boolean | null
          canViewAuditLog?: boolean | null
          color?: string | null
          createdAt?: string
          description?: string
          discordRoleId?: string | null
          discordSyncedColor?: number | null
          discordSyncedName?: string | null
          id?: string
          isLeadership?: boolean
          rank?: number | null
          roleType?: Database["public"]["Enums"]["roleType"]
          showOnProfile?: boolean
          title: string
        }
        Update: {
          canCreateCredentials?: boolean | null
          canManageFeedback?: boolean | null
          canManageRoles?: boolean | null
          canManageSuspensions?: boolean | null
          canManageVerification?: boolean | null
          canModerate?: boolean | null
          canViewAuditLog?: boolean | null
          color?: string | null
          createdAt?: string
          description?: string
          discordRoleId?: string | null
          discordSyncedColor?: number | null
          discordSyncedName?: string | null
          id?: string
          isLeadership?: boolean
          rank?: number | null
          roleType?: Database["public"]["Enums"]["roleType"]
          showOnProfile?: boolean
          title?: string
        }
        Relationships: []
      }
      siteFeedback: {
        Row: {
          adminNote: string | null
          attachmentPaths: string[] | null
          browserMetadata: Json | null
          clientId: string | null
          createdAt: string
          description: string
          id: string
          severity: Database["public"]["Enums"]["feedbackSeverity"] | null
          status: Database["public"]["Enums"]["feedbackStatus"]
          title: string
          topicId: string | null
          type: Database["public"]["Enums"]["feedbackType"]
          updatedAt: string
          userId: string
        }
        Insert: {
          adminNote?: string | null
          attachmentPaths?: string[] | null
          browserMetadata?: Json | null
          clientId?: string | null
          createdAt?: string
          description: string
          id?: string
          severity?: Database["public"]["Enums"]["feedbackSeverity"] | null
          status?: Database["public"]["Enums"]["feedbackStatus"]
          title: string
          topicId?: string | null
          type: Database["public"]["Enums"]["feedbackType"]
          updatedAt?: string
          userId: string
        }
        Update: {
          adminNote?: string | null
          attachmentPaths?: string[] | null
          browserMetadata?: Json | null
          clientId?: string | null
          createdAt?: string
          description?: string
          id?: string
          severity?: Database["public"]["Enums"]["feedbackSeverity"] | null
          status?: Database["public"]["Enums"]["feedbackStatus"]
          title?: string
          topicId?: string | null
          type?: Database["public"]["Enums"]["feedbackType"]
          updatedAt?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "siteFeedback_clientId_topicId_fkey"
            columns: ["clientId", "topicId"]
            isOneToOne: false
            referencedRelation: "feedbackTopics"
            referencedColumns: ["clientId", "id"]
          },
        ]
      }
      userRoles: {
        Row: {
          roleId: string
          userId: string
        }
        Insert: {
          roleId: string
          userId: string
        }
        Update: {
          roleId?: string
          userId?: string
        }
        Relationships: [
          {
            foreignKeyName: "userRoles_roleId_roles_id_fkey"
            columns: ["roleId"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      userSuspensions: {
        Row: {
          id: string
          reason: string | null
          service: string
          suspendedAt: string
          suspendedBy: string | null
          userId: string
        }
        Insert: {
          id?: string
          reason?: string | null
          service: string
          suspendedAt?: string
          suspendedBy?: string | null
          userId: string
        }
        Update: {
          id?: string
          reason?: string | null
          service?: string
          suspendedAt?: string
          suspendedBy?: string | null
          userId?: string
        }
        Relationships: []
      }
    }
    Views: {
      profileWithVerification: {
        Row: {
          hasDiscord: boolean | null
          hasGithub: boolean | null
          hasGraduationDate: boolean | null
          hasPronouns: boolean | null
          nameMatchesInvolvement: boolean | null
          userId: string | null
          verified: boolean | null
        }
        Insert: {
          hasDiscord?: never
          hasGithub?: never
          hasGraduationDate?: never
          hasPronouns?: never
          nameMatchesInvolvement?: never
          userId?: string | null
          verified?: never
        }
        Update: {
          hasDiscord?: never
          hasGithub?: never
          hasGraduationDate?: never
          hasPronouns?: never
          nameMatchesInvolvement?: never
          userId?: string | null
          verified?: never
        }
        Relationships: []
      }
      resolvedUserPermissions: {
        Row: {
          canCreateCredentials: boolean | null
          canManageFeedback: boolean | null
          canManageRoles: boolean | null
          canManageSuspensions: boolean | null
          canManageVerification: boolean | null
          canModerate: boolean | null
          canViewAuditLog: boolean | null
          isLeader: boolean | null
          minRank: number | null
          userId: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      contentAction: "quarantine" | "no_action"
      credentialType: "email_password" | "totp" | "email_password_totp"
      feedbackSeverity: "low" | "medium" | "high"
      feedbackStatus: "open" | "in_review" | "resolved" | "dismissed"
      feedbackType:
        | "bug_report"
        | "feature_request"
        | "design_feedback"
        | "performance"
        | "content_issue"
        | "other"
      filerAction: "warn" | "suspend" | "no_action"
      graduationSemester: "spring" | "summer" | "fall"
      oauthRegistrationType: "development" | "production"
      reportStatus: "unverified" | "pending" | "resolved" | "dismissed"
      roleType: "default" | "root" | "custom"
      subjectAction: "warn" | "suspend" | "ban" | "no_action"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

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
} as const


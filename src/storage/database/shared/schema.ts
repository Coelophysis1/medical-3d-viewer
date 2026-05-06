import { pgTable, text, timestamp, integer, index, serial } from "drizzle-orm/pg-core"

// 用户表
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    password_hash: text("password_hash").notNull(),
    role: text("role").notNull().default("doctor"), // 'admin' | 'doctor'
    status: text("status").notNull().default("active"), // 'active' | 'disabled'
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("users_username_idx").on(table.username),
  ]
);

// 患者表
export const patients = pgTable(
  "patients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),           // 患者姓名
    phone: text("phone").notNull(),         // 手机号
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("patients_phone_idx").on(table.phone),
  ]
);

// 医学3D模型配置表
export const medicalConfigs = pgTable(
  "medical_configs",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),  // 访问码，如 "Iyi11"
    patient_id: integer("patient_id").references(() => patients.id, { onDelete: "set null" }), // 关联患者
    creator_id: integer("creator_id").references(() => users.id, { onDelete: "set null" }), // 创建者（医生）
    title: text("title").notNull(),         // 页面标题
    patient_name: text("patient_name"),     // 患者姓名（冗余，便于查询）
    patient_phone: text("patient_phone"),   // 患者手机号（冗余，便于查询）
    patient_gender: text("patient_gender"), // 患者性别
    patient_age: integer("patient_age"),    // 患者年龄
    hospital: text("hospital"),            // 医院名称
    department: text("department"),          // 科室名称
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("medical_configs_code_idx").on(table.code),
    index("medical_configs_patient_id_idx").on(table.patient_id),
    index("medical_configs_creator_id_idx").on(table.creator_id),
    index("medical_configs_created_at_idx").on(table.created_at),
  ]
);

// 医学3D模型详情表
export const medicalModels = pgTable(
  "medical_models",
  {
    id: serial("id").primaryKey(),
    config_id: integer("config_id").notNull().references(() => medicalConfigs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),           // 模型名称
    color: text("color").notNull(),         // 渲染颜色 (purple/red/blue/green/pink)
    opacity: integer("opacity").default(100).notNull(),  // 透明度 0-100
    file_path: text("file_path").notNull(), // STL文件路径
    visible: integer("visible").default(1).notNull(),   // 是否可见 0/1
    sort_order: integer("sort_order").default(0).notNull(), // 排序
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("medical_models_config_id_idx").on(table.config_id),
    index("medical_models_sort_order_idx").on(table.sort_order),
  ]
);

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;
export type MedicalConfig = typeof medicalConfigs.$inferSelect;
export type InsertMedicalConfig = typeof medicalConfigs.$inferInsert;
export type MedicalModel = typeof medicalModels.$inferSelect;
export type InsertMedicalModel = typeof medicalModels.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 删除日志表
export const deleteLogs = pgTable(
  "delete_logs",
  {
    id: serial("id").primaryKey(),
    operator_id: integer("operator_id").notNull(),
    operator_name: text("operator_name").notNull(),
    config_id: integer("config_id").notNull(),
    config_code: text("config_code").notNull(),
    config_title: text("config_title"),
    patient_name: text("patient_name"),
    hospital: text("hospital"),
    department: text("department"),
    model_count: integer("model_count").default(0),
    deleted_files: text("deleted_files").array(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("delete_logs_operator_id_idx").on(table.operator_id),
    index("delete_logs_deleted_at_idx").on(table.deleted_at),
  ]
);

export type DeleteLog = typeof deleteLogs.$inferSelect;
export type InsertDeleteLog = typeof deleteLogs.$inferInsert;

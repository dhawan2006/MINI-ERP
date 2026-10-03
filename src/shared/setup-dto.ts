export type SetupStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface SetupStateDTO {
  status: SetupStatus;
}

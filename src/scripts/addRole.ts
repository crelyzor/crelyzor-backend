// import prisma from "../db/prismaClient";
// import { assignUserRole } from "../utils/assignRoles"; // Assuming assignUserRole is imported from the script you provided
// import { UserRoleEnum } from "@prisma/client";
// import { ErrorFactory } from "../utils/globalErrorHandler";

// /**
//  * Assigns a role and permissions to a user during onboarding for a new organization.
//  *
//  * @param email - User email to assign the role to.
//  * @param orgName - Organization name to assign the user to.
//  * @param roleName - Role to assign the user within the organization.
//  * @param accessLevel - Optional access level for the organization member (e.g., 'MEMBER', 'ADMIN').
//  * @returns Promise - Resolves with the result of the role assignment.
//  */
// export async function assignRoleToNewUserInOrg(
//   email: string,
//   orgName: string,
//   roleName: UserRoleEnum,
//   accessLevel: string = "MEMBER",
// ): Promise<any> {
//   try {
//     const user = await prisma.user.findUnique({
//       where: { email },
//     });

//     if (!user) {
//       throw ErrorFactory.notFound(`User with email ${email} not found`);
//     }

//     let organization = await prisma.organization.findFirst({
//       where: { name: orgName },
//     });

//     if (!organization) {
//       organization = await prisma.organization.create({
//         data: {
//           name: orgName,
//           hierarchyLevel: 1,
//           organizationDetails: {},
//         },
//       });
//       console.log(
//         `New organization ${orgName} created with ID: ${organization.id}`,
//       );
//     }

//     const orgMember = await prisma.organizationMember.create({
//       data: {
//         orgId: organization.id,
//         userId: user.id,
//         accessLevel: accessLevel,
//       },
//     });

//     const roleAssignmentResult = await assignUserRole({
//       userId: user.id,
//       orgId: organization.id,
//       roleName,
//     });
//     console.log(
//       `Role ${roleName} assigned to user ${email} in organization ${orgName}`,
//     );
//     console.log(`Role assignment result:`, roleAssignmentResult);
//     if (!roleAssignmentResult.success) {
//       throw ErrorFactory.internal("role assignment failed");
//     }

//     await prisma.organizationMember.update({
//       where: { id: orgMember.id },
//       data: {
//         roleId: roleAssignmentResult.data?.userRole.id,
//       },
//     });

//     console.log(
//       `Successfully assigned role ${roleName} to ${email} in organization ${orgName}`,
//     );

//     return {
//       success: true,
//       message: `Role ${roleName} successfully assigned to ${email} in organization ${orgName}`,
//     };
//   } catch (error) {
//     console.error("Error assigning role to user in organization:", error);
//     return {
//       success: false,
//       message: error instanceof Error ? error.message : "Unknown error",
//     };
//   }
// }

// assignRoleToNewUserInOrg(
//   "john.doe@example.com", // User email
//   "Example Organization", // Organization name
//   UserRoleEnum.ADMIN, // Access level (Optional, default is "MEMBER")
// )
//   .then(() => console.log("role created"))
//   .catch((e) => console.log("role creation failed:", e));

import { IsEmail, MaxLength } from "class-validator";

export class RegistrationCodeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

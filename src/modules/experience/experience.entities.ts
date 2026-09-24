import { Column, Entity, PrimaryColumn, ManyToOne, JoinColumn, UpdateDateColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from '../users/entities/user.entity';
@Entity('drink_records')
@Index(['ownerId', 'occurredAt'])
export class DrinkRecordEntity {
 @PrimaryColumn('uuid') ownerId!: string;
 @PrimaryColumn({length:64}) id!: string;
 @ManyToOne(() => User, {onDelete:'CASCADE'}) @JoinColumn({name:'ownerId'}) owner!: User;
 @Column('timestamptz') occurredAt!: Date;
 @Column('jsonb') data!: object;
 @Column({default:false}) deleted!: boolean;
 @Column({type:'integer',default:1}) version!: number;
 @CreateDateColumn({type:'timestamptz'}) createdAt!: Date;
 @Index() @Column({type:'timestamptz',default:()=> "now() + interval '7 days'"}) expiresAt!: Date;
 @Column({type:'varchar',length:16,default:'private'}) sharingStatus!: 'private'|'pending'|'published'|'rejected';
 @Column({type:'jsonb',nullable:true}) sharingSnapshot!: Record<string,unknown>|null;
 @Column({type:'varchar',length:500,nullable:true}) sharingReason!: string|null;
 @UpdateDateColumn({type:'timestamptz'}) updatedAt!: Date;
}
@Entity('flavor_directions')
export class FlavorEntity {
 @PrimaryColumn({length:64}) id!: string;
 @Column('jsonb') data!: object;
 @Column({default:true}) isActive!: boolean;
 @Column({default:0}) sortOrder!: number;
 @UpdateDateColumn({type:'timestamptz'}) updatedAt!: Date;
}

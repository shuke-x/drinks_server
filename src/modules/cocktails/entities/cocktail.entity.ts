import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Spirit } from '../mappers/spirit.mapper';
export type RecipeItem={n:string;ml?:number;t?:string};
@Entity('cocktails')
export class Cocktail {
  @PrimaryColumn({type:'varchar',length:32}) id!:string;
  @Column({length:64}) zh!:string;
  @Column({length:128,default:'House Original'}) en!:string;
  @Index() @Column({type:'enum',enum:Spirit}) spirit!:Spirit;
  @Column({type:'smallint',default:20}) abv!:number;
  @Column({length:9,default:'#0A84FF'}) color!:string;
  @Column({type:'simple-array',default:''}) tags!:string[];
  @Column({type:'jsonb',default:()=>"'[]'::jsonb"}) images!:string[];
  @Column({length:64,default:'依你所好'}) glass!:string;
  @Column({length:128,default:'自由发挥'}) garnish!:string;
  @Column({length:255,default:'来自你自己的酒单。'}) flavor!:string;
  @Column({type:'text',default:'这一杯由你定义。'}) story!:string;
  @Column({type:'jsonb',default:()=>"'[]'::jsonb"}) recipe!:RecipeItem[];
  @Column({type:'jsonb',default:()=>"'[]'::jsonb"}) steps!:string[];
  @Column({default:true}) isOfficial!:boolean;
  @CreateDateColumn({type:'timestamptz'}) createdAt!:Date;
  @UpdateDateColumn({type:'timestamptz'}) updatedAt!:Date;
  @DeleteDateColumn({type:'timestamptz',nullable:true}) deletedAt!:Date|null;
}

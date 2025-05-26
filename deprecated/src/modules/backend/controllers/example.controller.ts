import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ExampleProvider } from '../providers/example.provider';
import { Request, Response } from 'express';
import { ExampleDto } from '../model/dtos/example.dto';
import { AppMailerService } from 'src/modules/core/modules/mailer/app-mailer.service';

@Controller('example')
export class ExampleController {
  constructor(
    private readonly exampleProvider: ExampleProvider,
    private readonly appMailService: AppMailerService,
  ) {}

  @Get('test')
  public async test(
    @Req() req: Request,
    @Res() res: Response,
    @Query('test') myParam: string,
  ): Promise<string> {
    const data = await this.exampleProvider.example();
    res.json({
      data: data,
    });

    return;
  }

  @Get('testMail')
  public async testMail(
    @Req() req: Request,
    @Res() res: Response,
    @Query('name') name: string,
    @Query('email') email: string,
  ): Promise<string> {
    // Please note! Creating And Changing templates require restart to npm run start:dev
    // This is because the ejs files considers to be assets.
    await this.appMailService.sendMail(
      email || 'text@example.test',
      'Hello World',
      'example',
      { name: name || 'Anonymous' },
    );

    res.json({
      success: true,
    });

    return;
  }

  @Post()
  public async testPost(
    @Req() req: Request,
    @Body() body: ExampleDto,
  ): Promise<void> {}
}
